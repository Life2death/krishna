package com.krishna.assistant

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.provider.Settings
import android.util.Log

/**
 * Marks that a system assist gesture (long-press home / corner swipe / etc.)
 * just brought MainActivity to the foreground and JS should start listening
 * immediately, exactly like a mic tap. Polled once from JS on mount/focus via
 * the Rust JNI bridge (android_take_pending_assist).
 *
 * Also bridges the Phase 3 "make Krishna your assistant" Settings card:
 * reading the current default-assistant component (best-effort) and opening
 * the system picker so the user can select Krishna.
 */
object AssistBridgeHelper {
  private const val TAG = "AssistBridge"
  private const val PENDING_WINDOW_MS = 10_000L

  @Volatile
  private var pendingAt: Long = 0L

  @JvmStatic
  fun setPending() {
    pendingAt = SystemClock.elapsedRealtime()
  }

  /** Returns true at most once per setPending(), and only within the last ~10s. */
  @JvmStatic
  fun takePending(): Boolean {
    val at = pendingAt
    if (at == 0L) return false
    pendingAt = 0L
    return SystemClock.elapsedRealtime() - at <= PENDING_WINDOW_MS
  }

  /**
   * Best-effort read of the `assistant` Secure Setting — e.g.
   * "com.krishna.assistant/.KrishnaVoiceInteractionService" when Krishna is
   * selected, another package's component otherwise, or "" if unreadable.
   */
  @JvmStatic
  fun getCurrentAssistantComponent(context: Context): String {
    return try {
      Settings.Secure.getString(context.contentResolver, "assistant") ?: ""
    } catch (e: Exception) {
      Log.e(TAG, "getCurrentAssistantComponent failed", e)
      ""
    }
  }

  @JvmStatic
  fun isKrishnaTheAssistant(context: Context): Boolean =
    getCurrentAssistantComponent(context).substringBefore('/') == context.packageName

  /**
   * Open the system's default-apps picker so the user can select Krishna as
   * the Digital assistant app. `MANAGE_DEFAULT_APPS_SETTINGS` is confirmed
   * working on this One UI build (Settings -> Apps -> Choose default apps);
   * `ACTION_VOICE_INPUT_SETTINGS` failed to resolve on the same device, so
   * it is deliberately not used here.
   */
  @JvmStatic
  fun openAssistantSettings(context: Context) {
    try {
      val intent = Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    } catch (e: Exception) {
      Log.e(TAG, "openAssistantSettings failed", e)
    }
  }
}
