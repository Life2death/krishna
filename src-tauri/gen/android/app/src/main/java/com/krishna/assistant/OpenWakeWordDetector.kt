package com.krishna.assistant

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.ShortBuffer
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.sqrt
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil

data class OpenWakeWordConfig(
  val modelPath: String = "wake-word/openwakeword/model.tflite",
  val sampleRate: Int = 16000,
  val frameLengthMs: Int = 1280,
  val hopLengthMs: Int = 1280,
  val scoreThreshold: Float = 0.5f,
  val cooldownMs: Long = 2000,
  val smoothingWindow: Int = 5,
  val inputFeatures: Int = 128,
)

class OpenWakeWordDetector(
  private val context: Context,
  private val onWakeWordDetected: () -> Unit,
  config: OpenWakeWordConfig = OpenWakeWordConfig(),
) {
  companion object {
    private const val TAG = "OWWDetector"
    private val MODEL_ASSETS = arrayOf(
      "wake-word/openwakeword/model.tflite",
    )

    fun isAvailable(context: Context): Boolean = MODEL_ASSETS.all { asset ->
      runCatching { context.assets.open(asset).close() }.isSuccess
    }
  }

  private var config: OpenWakeWordConfig = config
  private val running = AtomicBoolean(false)
  private val detected = AtomicBoolean(false)
  private var audioRecord: AudioRecord? = null
  private var worker: Thread? = null
  private var interpreter: Interpreter? = null

  private val scoreHistory = mutableListOf<Float>()
  private var lastDetectionTimeMs = 0L
  private var frameCount = 0
  private var detectorState = "idle"
  private var lastError = ""

  val profileStore: WakeWordProfileStore = WakeWordProfileStore(context)
  val trainingStore: WakeWordTrainingStore = WakeWordTrainingStore(context)

  fun updateConfig(newConfig: OpenWakeWordConfig) {
    config = newConfig
  }

  fun start(): Boolean {
    if (running.get()) return true
    if (!isAvailable(context)) {
      lastError = "Model assets not found"
      Log.e(TAG, lastError)
      return false
    }

    return runCatching {
      detected.set(false)
      scoreHistory.clear()
      lastDetectionTimeMs = 0L
      frameCount = 0
      detectorState = "starting"

      interpreter = loadModel()
      if (interpreter == null) {
        lastError = "Failed to load TFLite model"
        Log.e(TAG, lastError)
        return false
      }

      val minimumBuffer = AudioRecord.getMinBufferSize(
        config.sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minimumBuffer <= 0) {
        lastError = "Unable to determine microphone buffer size"
        Log.e(TAG, lastError)
        return false
      }

      val audioSource = profileStore.load().audioSource
      val micSource = if (audioSource == "bluetooth_sco") {
        MediaRecorder.AudioSource.VOICE_COMMUNICATION
      } else {
        MediaRecorder.AudioSource.MIC
      }

      audioRecord = AudioRecord(
        micSource,
        config.sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minimumBuffer * 2,
      )
      if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
        lastError = "Unable to initialize microphone"
        Log.e(TAG, lastError)
        return false
      }

      audioRecord?.startRecording()
      running.set(true)
      detectorState = "listening"
      worker = thread(name = "krishna-oww", isDaemon = true) {
        processAudio()
      }
      Log.i(TAG, "OpenWakeWord detector started (audioSource=$audioSource, threshold=${config.scoreThreshold})")
      true
    }.getOrElse { error ->
      lastError = error.message ?: "Unknown error"
      Log.e(TAG, "Unable to start OpenWakeWord detector", error)
      releaseResources()
      false
    }
  }

  fun stop() {
    running.set(false)
    detectorState = "stopped"
    runCatching { audioRecord?.stop() }
    if (worker !== Thread.currentThread()) worker?.join(500)
  }

  fun release() {
    stop()
    releaseResources()
  }

  fun getCurrentConfig(): OpenWakeWordConfig = config
  fun getDetectorState(): String = detectorState
  fun getLastError(): String = lastError
  fun getFrameCount(): Int = frameCount

  private fun loadModel(): Interpreter? {
    return try {
      val modelBuffer = FileUtil.loadMappedFile(context, config.modelPath)
      Interpreter(modelBuffer)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to load TFLite model from ${config.modelPath}", e)
      lastError = "Model load error: ${e.message}"
      null
    }
  }

  private fun processAudio() {
    val frameSize = config.frameLengthMs
    val sampleBuffer = ShortArray(frameSize)
    val inputBuffer = ByteBuffer.allocateDirect(frameSize * 2)
    inputBuffer.order(ByteOrder.nativeOrder())
    val outputBuffer = Array(1) { FloatArray(2) }

    try {
      while (running.get()) {
        val count = audioRecord?.read(sampleBuffer, 0, frameSize) ?: break
        if (count <= 0) continue

        val now = SystemClock.elapsedRealtime()

        inputBuffer.rewind()
        inputBuffer.asShortBuffer().put(sampleBuffer, 0, count)

        interpreter?.run(inputBuffer, outputBuffer)

        val score = outputBuffer[0][1]
        frameCount++
        scoreHistory.add(score)
        if (scoreHistory.size > config.smoothingWindow) {
          scoreHistory.removeAt(0)
        }
        val smoothedScore = scoreHistory.average().toFloat()

        val currentProfile = profileStore.load()
        profileStore.setLastDiagnostics(
          lastScore = score,
          lastFrameCount = frameCount,
          lastDetectorState = detectorState,
          lastError = lastError,
        )

        if (score > 0.01f && frameCount % 50 == 0) {
          Log.d(TAG, "Score: $smoothedScore (raw: $score) threshold: ${config.scoreThreshold} frame: $frameCount")
        }

        if (smoothedScore >= config.scoreThreshold &&
          detected.compareAndSet(false, true)) {
          val cooldownOk = (now - lastDetectionTimeMs) > config.cooldownMs
          if (cooldownOk) {
            Log.i(TAG, "Wake word detected! smoothedScore=$smoothedScore raw=$score frame=$frameCount")
            lastDetectionTimeMs = now
            detectorState = "detected"
            running.set(false)
            profileStore.setLastDiagnostics(
              lastScore = smoothedScore,
              lastFrameCount = frameCount,
              lastDetectorState = "detected",
              lastError = "",
            )
            break
          } else {
            Log.d(TAG, "Detection suppressed by cooldown")
            detected.set(false)
          }
        }

        if (score < config.scoreThreshold * 0.3f) {
          detected.set(false)
        }
      }
    } catch (error: Exception) {
      lastError = error.message ?: "Audio loop error"
      Log.e(TAG, "OpenWakeWord audio loop failed", error)
    } finally {
      detectorState = "releasing"
      releaseResources()
      if (detected.get()) {
        onWakeWordDetected()
      }
    }
  }

  private fun releaseResources() {
    runCatching { audioRecord?.stop() }
    audioRecord?.release()
    audioRecord = null
    interpreter?.close()
    interpreter = null
    worker = null
    running.set(false)
    detectorState = "idle"
  }
}
