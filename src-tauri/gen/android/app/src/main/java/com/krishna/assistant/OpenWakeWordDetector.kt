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
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import org.json.JSONObject
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil

/**
 * Architecture: direct waveform classifier.
 *
 * Model input:  float32[1, 8000]  — 0.5s of 16 kHz audio, samples normalized to [-1, 1]
 * Model output: float32[1]        — wake-word probability (sigmoid)
 *
 * Android side accumulates AudioRecord frames (1280 samples at 80ms intervals)
 * into a ring buffer. Every frame, it copies the last 8000 samples, normalises
 * them to float32[-1,1], and runs TFLite inference. Scores are smoothed over
 * a configurable window before the threshold/cooldown gate.
 *
 * The detector never requests audio focus and never invokes SpeechRecognizer
 * or any command path. It is purely a shadow / gate component.
 */

data class ModelManifest(
  val modelVersion: String = "",
  val sha256: String = "",
  val sampleRate: Int = 16000,
  val frameLength: Int = 1280,
  val inputSamples: Int = 8000,
  val inputShape: List<Int> = listOf(1, 8000),
  val inputDtype: String = "float32",
  val outputShape: List<Int> = listOf(1, 1),
  val outputDtype: String = "float32",
  val outputLabels: List<String> = listOf("wake_probability"),
  val trainerVersion: String = "",
) {
  fun validate(inputTensorShape: IntArray, outputTensorShape: IntArray): String? {
    if (inputTensorShape.size != inputShape.size) return "Input rank mismatch: expected ${inputShape.size}, got ${inputTensorShape.size}"
    for (i in inputShape.indices) {
      if (inputTensorShape[i] >= 0 && inputTensorShape[i] != inputShape[i]) {
        return "Input dim $i mismatch: expected ${inputShape[i]}, got ${inputTensorShape[i]}"
      }
    }
    if (outputTensorShape.size != outputShape.size) return "Output rank mismatch: expected ${outputShape.size}, got ${outputTensorShape.size}"
    for (i in outputShape.indices) {
      if (outputTensorShape[i] >= 0 && outputTensorShape[i] != outputShape[i]) {
        return "Output dim $i mismatch: expected ${outputShape[i]}, got ${outputTensorShape[i]}"
      }
    }
    return null
  }
}

data class OpenWakeWordConfig(
  val modelPath: String = "wake-word/openwakeword/model.tflite",
  val manifestPath: String = "wake-word/openwakeword/manifest.json",
  val sampleRate: Int = 16000,
  val frameSamples: Int = 1280,
  val contextSamples: Int = 8000,
  val scoreThreshold: Float = 0.5f,
  val cooldownMs: Long = 2000,
  val smoothingWindow: Int = 5,
)

enum class DetectorMode { SHADOW, ACTIVE }

class OpenWakeWordDetector(
  private val context: Context,
  private val onWakeWordDetected: () -> Unit,
  config: OpenWakeWordConfig = OpenWakeWordConfig(),
) {
  companion object {
    private const val TAG = "OWWDetector"
    private val REQUIRED_ASSETS = arrayOf(
      "wake-word/openwakeword/model.tflite",
      "wake-word/openwakeword/manifest.json",
    )

    fun isAvailable(context: Context): Boolean = REQUIRED_ASSETS.all { asset ->
      runCatching { context.assets.open(asset).close() }.isSuccess
    }
  }

  private var config: OpenWakeWordConfig = config
  private val running = AtomicBoolean(false)
  private val detected = AtomicBoolean(false)
  private var audioRecord: AudioRecord? = null
  private var worker: Thread? = null
  private var interpreter: Interpreter? = null
  private var manifest: ModelManifest? = null
  private var validationError: String? = null

  private var mode = DetectorMode.SHADOW
  private val scoreHistory = mutableListOf<Float>()
  private var lastDetectionTimeMs = 0L
  private var frameCount = 0
  private var detectorState = "idle"
  private var lastError = ""

  private val ringBuffer = ShortArray(config.contextSamples)
  private var ringWritePos = 0
  private var ringFilled = false

  val profileStore = WakeWordProfileStore(context)
  val trainingStore = WakeWordTrainingStore(context)

  fun setMode(newMode: DetectorMode) { mode = newMode }
  fun getMode(): DetectorMode = mode
  fun getDetectorState(): String = detectorState
  fun getLastError(): String = lastError
  fun getFrameCount(): Int = frameCount
  fun getValidationError(): String? = validationError
  fun getManifest(): ModelManifest? = manifest

  private fun loadManifest(): ModelManifest? {
    return try {
      val json = context.assets.open(config.manifestPath).bufferedReader().use { it.readText() }
      val obj = JSONObject(json)
      ModelManifest(
        modelVersion = obj.optString("modelVersion", ""),
        sha256 = obj.optString("sha256", ""),
        sampleRate = obj.optInt("sampleRate", 16000),
        frameLength = obj.optInt("frameLength", 1280),
        inputSamples = obj.optInt("inputSamples", 8000),
        inputShape = obj.optJSONArray("inputShape")?.let { arr ->
          (0 until arr.length()).map { arr.getInt(it) }
        } ?: listOf(1, 8000),
        inputDtype = obj.optString("inputDtype", "float32"),
        outputShape = obj.optJSONArray("outputShape")?.let { arr ->
          (0 until arr.length()).map { arr.getInt(it) }
        } ?: listOf(1, 1),
        outputDtype = obj.optString("outputDtype", "float32"),
        outputLabels = obj.optJSONArray("outputLabels")?.let { arr ->
          (0 until arr.length()).map { arr.getString(it) }
        } ?: listOf("wake_probability"),
        trainerVersion = obj.optString("trainerVersion", ""),
      )
    } catch (e: Exception) {
      Log.e(TAG, "Failed to load model manifest", e)
      null
    }
  }

  fun start(): Boolean {
    if (running.get()) return true
    if (!isAvailable(context)) {
      validationError = "Model or manifest not found in assets"
      lastError = validationError!!
      Log.e(TAG, lastError)
      return false
    }

    return runCatching {
      detected.set(false)
      scoreHistory.clear()
      lastDetectionTimeMs = 0L
      frameCount = 0
      ringWritePos = 0
      ringFilled = false
      detectorState = "loading"
      validationError = null

      manifest = loadManifest()
      if (manifest == null) {
        validationError = "Failed to parse model manifest"
        lastError = validationError!!
        Log.e(TAG, lastError)
        return false
      }

      interpreter = loadModel()
      if (interpreter == null) {
        validationError = "Failed to load TFLite model"
        lastError = validationError!!
        Log.e(TAG, lastError)
        return false
      }

      val inputShape = interpreter?.getInputTensor(0)?.shape() ?: intArrayOf()
      val outputShape = interpreter?.getOutputTensor(0)?.shape() ?: intArrayOf()
      val manifestError = manifest!!.validate(inputShape, outputShape)
      if (manifestError != null) {
        validationError = "Model-manifest mismatch: $manifestError"
        lastError = validationError!!
        Log.e(TAG, lastError)
        interpreter?.close()
        interpreter = null
        return false
      }
      Log.i(TAG, "Model validated: version=${manifest!!.modelVersion}, input=${
        inputShape.joinToString()}, output=${outputShape.joinToString()}")

      profileStore.setModelVersion(manifest!!.modelVersion)

      val minimumBuffer = AudioRecord.getMinBufferSize(
        config.sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minimumBuffer <= 0) {
        validationError = "Unable to determine microphone buffer size"
        lastError = validationError!!
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
        minimumBuffer * 4,
      )
      if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
        validationError = "Unable to initialize microphone"
        lastError = validationError!!
        return false
      }

      audioRecord?.startRecording()
      running.set(true)
      detectorState = "listening"
      val modeLabel = if (mode == DetectorMode.SHADOW) "SHADOW" else "ACTIVE"
      Log.i(TAG, "Detector started mode=$modeLabel audioSource=$audioSource threshold=${config.scoreThreshold}")

      profileStore.setLastDiagnostics(0f, 0, "listening", "", force = true)
      worker = thread(name = "krishna-oww", isDaemon = true) { processAudio() }
      true
    }.getOrElse { error ->
      validationError = error.message ?: "Unknown start error"
      lastError = validationError!!
      Log.e(TAG, "Unable to start detector", error)
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
    val frameSamples = config.frameSamples
    val contextSamples = config.contextSamples
    val readBuf = ShortArray(frameSamples)
    val inputFloat = FloatArray(contextSamples)
    val inputBuffer = ByteBuffer.allocateDirect(contextSamples * 4)
    inputBuffer.order(ByteOrder.nativeOrder())
    val outputBuffer = Array(1) { FloatArray(1) }

    var lastDiagnosticsFlushMs = 0L

    try {
      while (running.get()) {
        val bytesRead = audioRecord?.read(readBuf, 0, frameSamples) ?: break
        if (bytesRead <= 0) continue

        val now = SystemClock.elapsedRealtime()

        // Accumulate into ring buffer
        for (i in 0 until bytesRead) {
          ringBuffer[ringWritePos] = readBuf[i]
          ringWritePos = (ringWritePos + 1) % contextSamples
          if (ringWritePos == 0) ringFilled = true
        }
        if (!ringFilled) continue
        if (ringWritePos < 0) continue

        // Copy ring buffer into contiguous normalized float array
        if (ringFilled) {
          val tailLen = contextSamples - ringWritePos
          for (i in 0 until contextSamples) {
            val srcIdx = (ringWritePos + i) % contextSamples
            inputFloat[i] = ringBuffer[srcIdx] / 32768.0f
          }
        }

        // Run inference
        inputBuffer.rewind()
        inputBuffer.asFloatBuffer().put(inputFloat)
        interpreter?.run(inputBuffer, outputBuffer)

        val score = outputBuffer[0][0]
        frameCount++
        scoreHistory.add(score)
        if (scoreHistory.size > config.smoothingWindow) {
          scoreHistory.removeAt(0)
        }
        val smoothedScore = scoreHistory.average().toFloat()

        // Throttled diagnostics flush — at most once per second
        if (now - lastDiagnosticsFlushMs >= 1_000L) {
          lastDiagnosticsFlushMs = now
          profileStore.setLastDiagnostics(
            lastScore = score,
            lastFrameCount = frameCount,
            lastDetectorState = detectorState,
            lastError = lastError,
            force = true,
          )
        }

        if (frameCount % 100 == 0 && score > 0.01f) {
          Log.d(TAG, "Score: $smoothedScore (raw: $score) frame=$frameCount mode=$mode")
        }

        // Detection gate — only applies in ACTIVE mode
        if (mode == DetectorMode.ACTIVE &&
          smoothedScore >= config.scoreThreshold &&
          detected.compareAndSet(false, true)) {
          val cooldownOk = (now - lastDetectionTimeMs) > config.cooldownMs
          if (cooldownOk) {
            Log.i(TAG, "ACTIVE: Wake word detected! score=$smoothedScore frame=$frameCount")
            lastDetectionTimeMs = now
            detectorState = "detected"
            running.set(false)
            profileStore.setLastDiagnostics(score, frameCount, "detected", "", force = true)
            break
          } else {
            Log.d(TAG, "Detection suppressed by cooldown")
            detected.set(false)
          }
        }

        if (mode == DetectorMode.SHADOW && score > 0.01f && frameCount % 200 == 0) {
          Log.d(TAG, "SHADOW score=$smoothedScore (would-detect=${smoothedScore >= config.scoreThreshold})")
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
      profileStore.setLastDiagnostics(0f, frameCount, "stopped", lastError, force = true)
      releaseResources()
      if (detected.get() && mode == DetectorMode.ACTIVE) {
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
