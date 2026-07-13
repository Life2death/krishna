package com.krishna.assistant

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONObject

data class EvaluationResult(
  val recall: Float = 0f,
  val falseWakeRate: Float = 0f,
  val sampleCount: Int = 0,
  val evaluatedAt: Long = 0L,
  val modelVersion: String = "",
)

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
  val evaluationResult: EvaluationResult = EvaluationResult(),
)

class WakeWordProfileStore(context: Context) {
  companion object {
    private const val TAG = "WakeWordProfile"
    private const val PREFS_NAME = "krishna_wake_word_profile"
    private const val KEY_PROFILE_JSON = "profile_json"

    fun validateActivationApproval(profile: WakeWordProfile): String? {
      if (profile.evaluationStatus != "ready_for_approval") {
        return "Cannot approve: evaluation status is '${profile.evaluationStatus}', need 'ready_for_approval'"
      }
      if (!profile.recordingRetentionEnabled) {
        return "Cannot approve: recording retention must be enabled to keep evaluation clips"
      }
      if (profile.modelVersion.isEmpty() || profile.evaluationResult.modelVersion != profile.modelVersion) {
        return "Cannot approve: evaluation version '${profile.evaluationResult.modelVersion}' does not match current model '${profile.modelVersion}'"
      }
      if (profile.evaluationResult.recall < 0.80f) {
        return "Cannot approve: recall ${profile.evaluationResult.recall} < 0.80 required"
      }
      if (profile.evaluationResult.falseWakeRate > 0.10f) {
        return "Cannot approve: false-wake rate ${profile.evaluationResult.falseWakeRate} > 0.10 required"
      }
      val hoursElapsed = if (profile.startedAt > 0L) (System.currentTimeMillis() - profile.startedAt) / 3_600_000L else 0L
      if (profile.positiveCount < 100) return "Readiness gate not met: ${profile.positiveCount}/100 positive clips"
      if (profile.negativeCount < 200) return "Readiness gate not met: ${profile.negativeCount}/200 negative clips"
      if (profile.environmentCount < 3) return "Readiness gate not met: ${profile.environmentCount}/3 environments"
      if (hoursElapsed < 48) return "Readiness gate not met: $hoursElapsed/48 hours elapsed"
      return null
    }
  }

  private val prefs: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private var cachedProfile: WakeWordProfile? = null
  private var lastDiagnosticsFlushedAt = 0L

  fun load(): WakeWordProfile {
    if (cachedProfile != null) return cachedProfile!!
    val json = prefs.getString(KEY_PROFILE_JSON, null) ?: return WakeWordProfile()
    return try {
      val obj = JSONObject(json)
      val evalObj = obj.optJSONObject("evaluationResult")
      val eval = if (evalObj != null) {
        EvaluationResult(
          recall = evalObj.optDouble("recall", 0.0).toFloat(),
          falseWakeRate = evalObj.optDouble("falseWakeRate", 0.0).toFloat(),
          sampleCount = evalObj.optInt("sampleCount", 0),
          evaluatedAt = evalObj.optLong("evaluatedAt", 0L),
          modelVersion = evalObj.optString("modelVersion", ""),
        )
      } else EvaluationResult()
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
        evaluationResult = eval,
      ).also { cachedProfile = it }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to parse profile JSON; returning defaults", e)
      WakeWordProfile()
    }
  }

  fun invalidateCache() { cachedProfile = null }

  private fun save(profile: WakeWordProfile) {
    try {
      cachedProfile = profile
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
      val evalObj = JSONObject().apply {
        put("recall", profile.evaluationResult.recall.toDouble())
        put("falseWakeRate", profile.evaluationResult.falseWakeRate.toDouble())
        put("sampleCount", profile.evaluationResult.sampleCount)
        put("evaluatedAt", profile.evaluationResult.evaluatedAt)
        put("modelVersion", profile.evaluationResult.modelVersion)
      }
      obj.put("evaluationResult", evalObj)
      prefs.edit().putString(KEY_PROFILE_JSON, obj.toString()).apply()
    } catch (e: Exception) {
      Log.e(TAG, "Failed to save profile JSON", e)
    }
  }

  fun setLastDiagnostics(
    lastScore: Float,
    lastFrameCount: Int,
    lastDetectorState: String,
    lastError: String,
    force: Boolean = false,
  ) {
    val now = System.currentTimeMillis()
    if (!force && (now - lastDiagnosticsFlushedAt) < 1_000L) {
      val current = load()
      cachedProfile = current.copy(
        lastScore = lastScore,
        lastFrameCount = lastFrameCount,
        lastDetectorState = lastDetectorState,
        lastError = lastError,
      )
      return
    }
    lastDiagnosticsFlushedAt = now
    val current = load()
    save(current.copy(
      lastScore = lastScore,
      lastFrameCount = lastFrameCount,
      lastDetectorState = lastDetectorState,
      lastError = lastError,
    ))
  }

  fun setModelVersion(version: String): WakeWordProfile {
    val current = load()
    save(current.copy(modelVersion = version))
    return cachedProfile!!
  }

  fun setEnabled(enabled: Boolean): WakeWordProfile {
    val current = load()
    save(current.copy(enabled = enabled))
    return cachedProfile!!
  }

  fun setConsentGranted(): WakeWordProfile {
    val current = load()
    save(current.copy(
      consentGrantedAt = System.currentTimeMillis(),
      startedAt = if (current.startedAt == 0L) System.currentTimeMillis() else current.startedAt,
    ))
    return cachedProfile!!
  }

  fun setActivationApproved(): WakeWordProfile? {
    val current = load()
    val error = validateActivationApproval(current)
    if (error != null) {
      Log.w(TAG, error)
      save(current.copy(lastError = error))
      return null
    }
    save(current.copy(
      activationApprovedAt = System.currentTimeMillis(),
      evaluationStatus = "approved",
    ))
    return cachedProfile!!
  }

  fun incrementPositive(): WakeWordProfile {
    val current = load()
    save(current.copy(
      positiveCount = current.positiveCount + 1,
      environmentCount = current.environmentCount + 1,
    ))
    return cachedProfile!!
  }

  fun incrementNegative(): WakeWordProfile {
    val current = load()
    save(current.copy(
      negativeCount = current.negativeCount + 1,
      environmentCount = current.environmentCount + 1,
    ))
    return cachedProfile!!
  }

  fun setEvaluationStatus(status: String): WakeWordProfile {
    val current = load()
    save(current.copy(evaluationStatus = status))
    return cachedProfile!!
  }

  fun setAudioSource(source: String): WakeWordProfile {
    val current = load()
    save(current.copy(audioSource = source))
    return cachedProfile!!
  }

  fun setRecordingRetention(enabled: Boolean): WakeWordProfile {
    val current = load()
    save(current.copy(recordingRetentionEnabled = enabled))
    return cachedProfile!!
  }

  fun recordEvaluation(eval: EvaluationResult): WakeWordProfile {
    val current = load()
    val passed = eval.recall >= 0.8f && eval.falseWakeRate <= 0.1f
    save(current.copy(
      evaluationResult = eval,
      evaluationStatus = if (passed) "ready_for_approval" else "failed",
    ))
    return cachedProfile!!
  }

  fun isReadinessGateMet(): Boolean {
    val p = load()
    val hoursElapsed = if (p.startedAt > 0L) (System.currentTimeMillis() - p.startedAt) / 3_600_000L else 0L
    return p.positiveCount >= 100 && p.negativeCount >= 200 && p.environmentCount >= 3 && hoursElapsed >= 48
  }

  fun reset(): WakeWordProfile {
    val blank = WakeWordProfile()
    save(blank)
    return blank
  }
}
