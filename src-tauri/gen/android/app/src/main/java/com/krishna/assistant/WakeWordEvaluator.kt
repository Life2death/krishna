package com.krishna.assistant

import android.content.Context
import android.util.Log
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.ShortBuffer
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil

/**
 * Local held-out evaluation of the wake-word model against stored training clips.
 *
 * Loads the packaged model.tflite, runs inference on held-out WAV clips,
 * and produces recall / false-wake-rate metrics persisted via WakeWordProfileStore.
 */
class WakeWordEvaluator(private val context: Context) {
  companion object {
    private const val TAG = "WWEvaluator"
    private const val MODEL_PATH = "wake-word/openwakeword/model.tflite"
    private const val MANIFEST_PATH = "wake-word/openwakeword/manifest.json"
    private const val TEST_SPLIT = 0.2f
    private const val SAMPLE_RATE = 16000
    private const val CONTEXT_SAMPLES = 8000
  }

  data class EvalResult(
    val recall: Float,
    val falseWakeRate: Float,
    val sampleCount: Int,
    val modelVersion: String,
  )

  fun evaluate(): EvalResult? {
    return try {
      val profileStore = WakeWordProfileStore(context)
      val profile = profileStore.load()

      // Load model
      val modelBuffer = FileUtil.loadMappedFile(context, MODEL_PATH)
      val interpreter = Interpreter(modelBuffer)
      interpreter.allocateTensors()

      val inp = interpreter.getInputTensor(0)
      val out = interpreter.getOutputTensor(0)
      val inpShape = inp.shape()
      val outShape = out.shape()

      // Validate input shape matches expected [1, 8000]
      if (inpShape.size != 2 || inpShape[0] != 1 || inpShape[1] != CONTEXT_SAMPLES) {
        Log.e(TAG, "Model input shape mismatch: ${inpShape.joinToString()} expected [1, $CONTEXT_SAMPLES]")
        interpreter.close()
        return null
      }

      val trainingStore = WakeWordTrainingStore(context)
      val allClips = trainingStore.getClips()
      if (allClips.size < 10) {
        Log.w(TAG, "Too few clips for evaluation: ${allClips.size}")
        interpreter.close()
        return null
      }

      // Split into train/test (simple 80/20 shuffle using label as seed)
      val shuffled = allClips.shuffled(java.util.Random(42))
      val testSize = maxOf(1, (shuffled.size * TEST_SPLIT).toInt())
      val testClips = shuffled.take(testSize)

      var tp = 0
      var fp = 0
      var tn = 0
      var fn = 0
      val outputBuffer = Array(1) { FloatArray(1) }
      val inputArray = Array(1) { FloatArray(CONTEXT_SAMPLES) }

      for (clip in testClips) {
        val wavFile = File(clip.filePath)
        if (!wavFile.exists()) continue

        try {
          val audio = loadWavAudio(wavFile)
          if (audio == null) continue

          val inputFloats = inputArray[0]
          if (audio.size >= CONTEXT_SAMPLES) {
            audio.copyInto(inputFloats, 0, 0, CONTEXT_SAMPLES)
          } else {
            inputFloats.fill(0f)
            audio.copyInto(inputFloats, 0, 0, audio.size)
          }

          interpreter.run(inputArray, outputBuffer)
          val score = outputBuffer[0][0]
          val predicted = score >= 0.5f
          val actualPositive = clip.label == "positive"

          if (predicted && actualPositive) tp++
          else if (predicted && !actualPositive) fp++
          else if (!predicted && !actualPositive) tn++
          else fn++
        } catch (e: Exception) {
          Log.w(TAG, "Skipping clip ${clip.id}: ${e.message}")
        }
      }

      interpreter.close()

      val recall = if (tp + fn > 0) tp.toFloat() / (tp + fn) else 0f
      val falseWakeRate = if (fp + tn > 0) fp.toFloat() / (fp + tn) else 0f
      val sampleCount = testClips.size
      val modelVersion = profile.modelVersion

      // Persist
      profileStore.recordEvaluation(EvaluationResult(
        recall = recall,
        falseWakeRate = falseWakeRate,
        sampleCount = sampleCount,
        evaluatedAt = System.currentTimeMillis(),
        modelVersion = modelVersion,
      ))

      Log.i(TAG, "Evaluation: recall=$recall, FPR=$falseWakeRate, samples=$sampleCount")
      EvalResult(recall, falseWakeRate, sampleCount, modelVersion)
    } catch (e: Exception) {
      Log.e(TAG, "Evaluation failed", e)
      null
    }
  }

  /**
   * Read a 16-bit mono WAV file and return float32 [-1, 1] samples.
   * Skips the 44-byte RIFF header.
   */
  private fun loadWavAudio(file: File): FloatArray? {
    return try {
      RandomAccessFile(file, "r").use { raf ->
        val fileLen = raf.length()
        if (fileLen < 44) return null
        raf.seek(44)
        val dataSize = (fileLen - 44).toInt()
        if (dataSize <= 0) return null
        val numSamples = dataSize / 2
        val buf = ByteArray(dataSize)
        raf.readFully(buf)
        val result = FloatArray(numSamples)
        var idx = 0
        for (i in 0 until dataSize step 2) {
          val sample = (buf[i].toInt() and 0xff) or (buf[i + 1].toInt() shl 8)
          result[idx++] = sample.toShort() / 32768.0f
        }
        result
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to load WAV ${file.name}: ${e.message}")
      null
    }
  }
}
