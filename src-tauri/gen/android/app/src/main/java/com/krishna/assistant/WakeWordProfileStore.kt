package com.krishna.assistant

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONObject

data class WakeWordProfile(
  val enabled: Boolean = false,
  val modelVersion: String = "",
  val consentGrantedAt: Long = 0L,
  val positiveCount: Int = 0,
  val negativeCount: Int = 0,
  val environmentCount: Int = 0,
  val startedAt: Long = 0L,
  val evaluationStatus: String = "collecting",
  val activationApprovedAt: Long = 0L,
  val lastError: String = "",
  val audioSource: String = "builtin_mic",
  val threshold: Float = 0.5f,
  val lastScore: Float = 0f,
  val lastFrameCount: Int = 0,
  val lastDetectorState: String = "idle",
  val recordingRetentionEnabled: Boolean = false,
)

class WakeWordProfileStore(context: Context) {
  companion object {
    private const val TAG = "WakeWordProfile"
    private const val PREFS_NAME = "krishna_wake_word_profile"
    private const val KEY_PROFILE_JSON = "profile_json"
  }

  private val prefs: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun load(): WakeWordProfile {
    val json = prefs.getString(KEY_PROFILE_JSON, null) ?: return WakeWordProfile()
    return try {
      val obj = JSONObject(json)
      WakeWordProfile(
        enabled = obj.optBoolean("enabled", false),
        modelVersion = obj.optString("modelVersion", ""),
        consentGrantedAt = obj.optLong("consentGrantedAt", 0L),
        positiveCount = obj.optInt("positiveCount", 0),
        negativeCount = obj.optInt("negativeCount", 0),
        environmentCount = obj.optInt("environmentCount", 0),
        startedAt = obj.optLong("startedAt", 0L),
        evaluationStatus = obj.optString("evaluationStatus", "collecting"),
        activationApprovedAt = obj.optLong("activationApprovedAt", 0L),
        lastError = obj.optString("lastError", ""),
        audioSource = obj.optString("audioSource", "builtin_mic"),
        threshold = obj.optDouble("threshold", 0.5).toFloat(),
        lastScore = obj.optDouble("lastScore", 0.0).toFloat(),
        lastFrameCount = obj.optInt("lastFrameCount", 0),
        lastDetectorState = obj.optString("lastDetectorState", "idle"),
        recordingRetentionEnabled = obj.optBoolean("recordingRetentionEnabled", false),
      )
    } catch (e: Exception) {
      Log.w(TAG, "Failed to parse profile JSON; returning defaults", e)
      WakeWordProfile()
    }
  }

  fun save(profile: WakeWordProfile) {
    try {
      val obj = JSONObject()
      obj.put("enabled", profile.enabled)
      obj.put("modelVersion", profile.modelVersion)
      obj.put("consentGrantedAt", profile.consentGrantedAt)
      obj.put("positiveCount", profile.positiveCount)
      obj.put("negativeCount", profile.negativeCount)
      obj.put("environmentCount", profile.environmentCount)
      obj.put("startedAt", profile.startedAt)
      obj.put("evaluationStatus", profile.evaluationStatus)
      obj.put("activationApprovedAt", profile.activationApprovedAt)
      obj.put("lastError", profile.lastError)
      obj.put("audioSource", profile.audioSource)
      obj.put("threshold", profile.threshold.toDouble())
      obj.put("lastScore", profile.lastScore.toDouble())
      obj.put("lastFrameCount", profile.lastFrameCount)
      obj.put("lastDetectorState", profile.lastDetectorState)
      obj.put("recordingRetentionEnabled", profile.recordingRetentionEnabled)
      prefs.edit().putString(KEY_PROFILE_JSON, obj.toString()).apply()
    } catch (e: Exception) {
      Log.e(TAG, "Failed to save profile JSON", e)
    }
  }

  fun incrementPositive(): WakeWordProfile {
    val current = load()
    val updated = current.copy(
      positiveCount = current.positiveCount + 1,
      environmentCount = current.environmentCount + 1,
    )
    save(updated)
    return updated
  }

  fun incrementNegative(): WakeWordProfile {
    val current = load()
    val updated = current.copy(
      negativeCount = current.negativeCount + 1,
      environmentCount = current.environmentCount + 1,
    )
    save(updated)
    return updated
  }

  fun setEvaluationStatus(status: String): WakeWordProfile {
    val current = load()
    val updated = current.copy(evaluationStatus = status)
    save(updated)
    return updated
  }

  fun setEnabled(enabled: Boolean): WakeWordProfile {
    val current = load()
    val updated = current.copy(enabled = enabled)
    save(updated)
    return updated
  }

  fun setConsentGranted(): WakeWordProfile {
    val current = load()
    val updated = current.copy(
      consentGrantedAt = System.currentTimeMillis(),
      startedAt = if (current.startedAt == 0L) System.currentTimeMillis() else current.startedAt,
    )
    save(updated)
    return updated
  }

  fun setActivationApproved(): WakeWordProfile {
    val current = load()
    val updated = current.copy(
      activationApprovedAt = System.currentTimeMillis(),
      evaluationStatus = "passed",
    )
    save(updated)
    return updated
  }

  fun setLastDiagnostics(
    lastScore: Float,
    lastFrameCount: Int,
    lastDetectorState: String,
    lastError: String,
  ): WakeWordProfile {
    val current = load()
    val updated = current.copy(
      lastScore = lastScore,
      lastFrameCount = lastFrameCount,
      lastDetectorState = lastDetectorState,
      lastError = lastError,
    )
    save(updated)
    return updated
  }

  fun setAudioSource(source: String): WakeWordProfile {
    val current = load()
    val updated = current.copy(audioSource = source)
    save(updated)
    return updated
  }

  fun setThreshold(threshold: Float): WakeWordProfile {
    val current = load()
    val updated = current.copy(threshold = threshold)
    save(updated)
    return updated
  }

  fun setModelVersion(version: String): WakeWordProfile {
    val current = load()
    val updated = current.copy(modelVersion = version)
    save(updated)
    return updated
  }

  fun setRecordingRetention(enabled: Boolean): WakeWordProfile {
    val current = load()
    val updated = current.copy(recordingRetentionEnabled = enabled)
    save(updated)
    return updated
  }

  fun isReadinessGateMet(): Boolean {
    val profile = load()
    val hoursElapsed = if (profile.startedAt > 0L) {
      (System.currentTimeMillis() - profile.startedAt) / 3_600_000L
    } else 0L
    return profile.positiveCount >= 100 &&
      profile.negativeCount >= 200 &&
      profile.environmentCount >= 3 &&
      hoursElapsed >= 48
  }

  fun reset(): WakeWordProfile {
    val blank = WakeWordProfile()
    save(blank)
    return blank
  }
}
