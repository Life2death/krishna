package com.krishna.assistant

import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * Static bridge for Tauri/React frontend to read/write the native
 * WakeWordProfile via JNI. Returns JSON strings so the Rust bridge
 * can serialize them easily.
 */
object WakeWordBridgeHelper {
  private const val TAG = "WWBridgeHelper"

  @JvmStatic
  fun getProfileJson(context: Context): String {
    return try {
      val store = WakeWordProfileStore(context)
      val profile = store.load()
      val obj = JSONObject().apply {
        put("enabled", profile.enabled)
        put("modelVersion", profile.modelVersion)
        put("consentGrantedAt", profile.consentGrantedAt)
        put("positiveCount", profile.positiveCount)
        put("negativeCount", profile.negativeCount)
        put("environmentCount", profile.environmentCount)
        put("startedAt", profile.startedAt)
        put("evaluationStatus", profile.evaluationStatus)
        put("activationApprovedAt", profile.activationApprovedAt)
        put("lastError", profile.lastError)
        put("audioSource", profile.audioSource)
        put("threshold", profile.threshold.toDouble())
        put("lastScore", profile.lastScore.toDouble())
        put("lastFrameCount", profile.lastFrameCount)
        put("lastDetectorState", profile.lastDetectorState)
        put("recordingRetentionEnabled", profile.recordingRetentionEnabled)
        val eval = JSONObject().apply {
          put("recall", profile.evaluationResult.recall.toDouble())
          put("falseWakeRate", profile.evaluationResult.falseWakeRate.toDouble())
          put("sampleCount", profile.evaluationResult.sampleCount)
          put("evaluatedAt", profile.evaluationResult.evaluatedAt)
          put("modelVersion", profile.evaluationResult.modelVersion)
        }
        put("evaluationResult", eval)
      }
      obj.toString()
    } catch (e: Exception) {
      Log.e(TAG, "getProfileJson failed", e)
      "{}"
    }
  }

  @JvmStatic
  fun updateProfileField(context: Context, field: String, value: String): Boolean {
    return try {
      val store = WakeWordProfileStore(context)
      when (field) {
        "enabled" -> store.setEnabled(value.toBoolean())
        "audioSource" -> store.setAudioSource(value)
        "consentGranted" -> if (value.toBoolean()) store.setConsentGranted()
        "activationApproved" -> {
          if (!value.toBoolean()) return true
          val result = store.setActivationApproved()
          if (result == null) {
            Log.w(TAG, "Activation approval denied: ${store.load().lastError}")
            return false
          }
        }
        "recordingRetention" -> store.setRecordingRetention(value.toBoolean())
        "evaluationStatus" -> store.setEvaluationStatus(value)
        else -> Log.w(TAG, "Unknown profile field: $field")
      }
      true
    } catch (e: Exception) {
      Log.e(TAG, "updateProfileField failed", e)
      false
    }
  }

  @JvmStatic
  fun resetProfile(context: Context): Boolean {
    return try {
      val store = WakeWordProfileStore(context)
      store.reset()
      val trainingStore = WakeWordTrainingStore(context)
      trainingStore.deleteAllClips()
      true
    } catch (e: Exception) {
      Log.e(TAG, "resetProfile failed", e)
      false
    }
  }

  @JvmStatic
  fun getTrainingInfoJson(context: Context): String {
    return try {
      val store = WakeWordTrainingStore(context)
      val profileStore = WakeWordProfileStore(context)
      val profile = profileStore.load()
      val obj = JSONObject().apply {
        put("clipCount", store.getClipCount())
        put("positiveCount", profile.positiveCount)
        put("negativeCount", profile.negativeCount)
        put("environmentCount", profile.environmentCount)
        put("totalStorageBytes", store.getTotalStorageBytes())
        put("totalStorageFormatted", store.getTotalStorageFormatted())
      }
      obj.toString()
    } catch (e: Exception) {
      Log.e(TAG, "getTrainingInfoJson failed", e)
      "{}"
    }
  }

  @JvmStatic
  fun isModelAvailable(context: Context): Boolean {
    return OpenWakeWordDetector.isAvailable(context)
  }

  @JvmStatic
  fun captureClip(context: Context, label: String): String {
    return try {
      val store = WakeWordTrainingStore(context)
      var resultClip: TrainingClip? = null
      val latch = java.util.concurrent.CountDownLatch(1)
      store.recordTrainingClipAsync(label, 3000, 16000) { clip ->
        resultClip = clip
        latch.countDown()
      }
      latch.await(10, java.util.concurrent.TimeUnit.SECONDS)
      if (resultClip != null) {
        val clip = resultClip!!
        val profileStore = WakeWordProfileStore(context)
        if (label == "positive") profileStore.incrementPositive()
        else profileStore.incrementNegative()
        val obj = JSONObject().apply {
          put("success", true)
          put("clipId", clip.id)
          put("label", clip.label)
          put("sha256", clip.sha256)
          put("filePath", clip.filePath)
          put("durationMs", clip.durationMs)
        }
        obj.toString()
      } else {
        """{"success":false,"error":"Recording did not produce a clip"}"""
      }
    } catch (e: Exception) {
      Log.e(TAG, "captureClip failed", e)
      """{"success":false,"error":"${e.message}"}"""
    }
  }

  @JvmStatic
  fun getTrainingSummary(context: Context): String {
    return try {
      val store = WakeWordTrainingStore(context)
      val profileStore = WakeWordProfileStore(context)
      val profile = profileStore.load()
      val obj = JSONObject().apply {
        put("clipCount", store.getClipCount())
        put("positiveCount", profile.positiveCount)
        put("negativeCount", profile.negativeCount)
        put("environmentCount", profile.environmentCount)
        put("totalStorageBytes", store.getTotalStorageBytes())
        put("totalStorageFormatted", store.getTotalStorageFormatted())
      }
      obj.toString()
    } catch (e: Exception) {
      Log.e(TAG, "getTrainingSummary failed", e)
      "{}"
    }
  }

  @JvmStatic
  fun runEvaluation(context: Context): String {
    return try {
      val evaluator = WakeWordEvaluator(context)
      val result = evaluator.evaluate()
      if (result != null) {
        val obj = JSONObject().apply {
          put("success", true)
          put("recall", result.recall.toDouble())
          put("falseWakeRate", result.falseWakeRate.toDouble())
          put("sampleCount", result.sampleCount)
          put("modelVersion", result.modelVersion)
        }
        obj.toString()
      } else {
        """{"success":false,"error":"Evaluation failed or insufficient data"}"""
      }
    } catch (e: Exception) {
      Log.e(TAG, "runEvaluation failed", e)
      """{"success":false,"error":"${e.message}"}"""
    }
  }

  @JvmStatic
  fun getDetectorState(context: Context): String {
    // Return a JSON summary of the current detector state
    return try {
      val store = WakeWordProfileStore(context)
      val profile = store.load()
      val obj = JSONObject().apply {
        put("detectorState", profile.lastDetectorState)
        put("lastScore", profile.lastScore.toDouble())
        put("lastFrameCount", profile.lastFrameCount)
        put("lastError", profile.lastError)
        put("modelVersion", profile.modelVersion)
        put("evaluationStatus", profile.evaluationStatus)
        put("activationApprovedAt", profile.activationApprovedAt)
        put("modelAvailable", isModelAvailable(context))
        put("readinessGateMet", store.isReadinessGateMet())
      }
      obj.toString()
    } catch (e: Exception) {
      Log.e(TAG, "getDetectorState failed", e)
      "{}"
    }
  }
}
