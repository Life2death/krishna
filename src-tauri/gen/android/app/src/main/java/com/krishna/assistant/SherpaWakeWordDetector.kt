package com.krishna.assistant

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.sqrt

class SherpaWakeWordDetector(
  private val context: Context,
  private val onWakeWordDetected: () -> Unit,
) {
  companion object {
    private const val TAG = "KrishnaWakeWord"
    private const val SAMPLE_RATE = 16000
    private const val MODEL_DIR = "wake-word/sherpa-kws"
    private val requiredAssets = arrayOf(
      "$MODEL_DIR/encoder.int8.onnx",
      "$MODEL_DIR/decoder.int8.onnx",
      "$MODEL_DIR/joiner.int8.onnx",
      "$MODEL_DIR/tokens.txt",
      "$MODEL_DIR/keywords.txt",
      "$MODEL_DIR/self-test.wav",
      "$MODEL_DIR/self-test-keywords.txt",
    )

    fun isAvailable(context: Context): Boolean = requiredAssets.all { asset ->
      runCatching { context.assets.open(asset).close() }.isSuccess
    }
  }

  private val running = AtomicBoolean(false)
  private val detected = AtomicBoolean(false)
  private var audioRecord: AudioRecord? = null
  private var worker: Thread? = null
  private var keywordSpotter: KeywordSpotter? = null
  private var stream: OnlineStream? = null

  fun start(): Boolean {
    if (running.get()) return true
    if (!isAvailable(context)) return false

    return runCatching {
      detected.set(false)
      keywordSpotter = KeywordSpotter(context.assets, createConfig())
      stream = keywordSpotter?.createStream()
      if (stream?.ptr == 0L) error("Unable to create Sherpa keyword stream")

      val minimumBuffer = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minimumBuffer <= 0) error("Unable to determine microphone buffer size")

      audioRecord = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minimumBuffer * 2,
      )
      if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
        error("Unable to initialize wake-word microphone")
      }

      running.set(true)
      audioRecord?.startRecording()
      worker = thread(name = "krishna-wake-word", isDaemon = true) {
        processAudio()
      }
      true
    }.getOrElse { error ->
      Log.e(TAG, "Unable to start Sherpa wake-word detection", error)
      releaseResources()
      false
    }
  }

  fun stop() {
    running.set(false)
    runCatching { audioRecord?.stop() }
    if (worker !== Thread.currentThread()) worker?.join(500)
  }

  fun release() {
    stop()
    releaseResources()
  }

  private fun processAudio() {
    runSelfTest()
    val samples = ShortArray(SAMPLE_RATE / 10)
    var triggered = false
    var lastLevelLogAt = 0L
    var decodeCount = 0
    try {
      while (running.get()) {
        val count = audioRecord?.read(samples, 0, samples.size) ?: break
        if (count <= 0) continue
        val now = SystemClock.elapsedRealtime()
        if (now - lastLevelLogAt >= 2_000) {
          var sumSquares = 0.0
          for (index in 0 until count) {
            val sample = samples[index].toDouble() / 32768.0
            sumSquares += sample * sample
          }
          Log.d(TAG, "Wake-word microphone active; rms=${"%.4f".format(sqrt(sumSquares / count))}; decoded=$decodeCount")
          lastLevelLogAt = now
        }
        val waveform = FloatArray(count) { index -> samples[index] / 32768.0f }
        val currentStream = stream ?: break
        val currentSpotter = keywordSpotter ?: break
        currentStream.acceptWaveform(waveform, SAMPLE_RATE)
        while (currentSpotter.isReady(currentStream)) {
          currentSpotter.decode(currentStream)
          decodeCount += 1
          val keyword = currentSpotter.getResult(currentStream).keyword
          if (keyword.isNotBlank() && detected.compareAndSet(false, true)) {
            Log.i(TAG, "Wake word detected: $keyword")
            triggered = true
            running.set(false)
            break
          }
        }
      }
    } catch (error: Exception) {
      Log.e(TAG, "Wake-word audio loop failed", error)
    } finally {
      releaseResources()
      if (triggered) onWakeWordDetected()
    }
  }

  private fun runSelfTest() {
    val selfTestSpotter = runCatching {
      KeywordSpotter(context.assets, createConfig("$MODEL_DIR/self-test-keywords.txt"))
    }.getOrElse { error ->
      Log.e(TAG, "Wake-word self-test could not create detector", error)
      return
    }
    val selfTestStream = selfTestSpotter.createStream()
    try {
      val wav = context.assets.open("$MODEL_DIR/self-test.wav").use { it.readBytes() }
      val dataOffset = 44
      val sampleCount = (wav.size - dataOffset) / 2
      val samples = FloatArray(sampleCount) { index ->
        val byteIndex = dataOffset + index * 2
        val lowByte = wav[byteIndex].toInt() and 0xff
        val highByte = wav[byteIndex + 1].toInt()
        ((highByte shl 8) or lowByte).toShort() / 32768.0f
      }
      selfTestStream.acceptWaveform(samples, SAMPLE_RATE)
      var decodeCount = 0
      var keyword = ""
      while (selfTestSpotter.isReady(selfTestStream)) {
        selfTestSpotter.decode(selfTestStream)
        decodeCount += 1
        keyword = selfTestSpotter.getResult(selfTestStream).keyword.ifBlank { keyword }
      }
      Log.i(TAG, "Wake-word self-test complete; decoded=$decodeCount; keyword=${keyword.ifBlank { "none" }}")
    } catch (error: Exception) {
      Log.e(TAG, "Wake-word self-test failed", error)
    } finally {
      selfTestStream.release()
      selfTestSpotter.release()
    }
  }

  private fun releaseResources() {
    runCatching { audioRecord?.stop() }
    audioRecord?.release()
    audioRecord = null
    stream?.release()
    stream = null
    keywordSpotter?.release()
    keywordSpotter = null
    worker = null
    running.set(false)
  }

  private fun createConfig(keywordsFile: String = "$MODEL_DIR/keywords.txt"): KeywordSpotterConfig = KeywordSpotterConfig(
    featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
    modelConfig = OnlineModelConfig(
      transducer = OnlineTransducerModelConfig(
        encoder = "$MODEL_DIR/encoder.int8.onnx",
        decoder = "$MODEL_DIR/decoder.int8.onnx",
        joiner = "$MODEL_DIR/joiner.int8.onnx",
      ),
      tokens = "$MODEL_DIR/tokens.txt",
      modelType = "zipformer2",
    ),
    keywordsFile = keywordsFile,
    keywordsScore = 1.0f,
    keywordsThreshold = 0.1f,
    numTrailingBlanks = 1,
  )
}
