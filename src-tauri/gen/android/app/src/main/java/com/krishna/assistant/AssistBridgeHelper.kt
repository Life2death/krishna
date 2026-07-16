package com.krishna.assistant

import android.os.SystemClock

/**
 * Marks that a system assist gesture (long-press home / corner swipe / etc.)
 * just brought MainActivity to the foreground and JS should start listening
 * immediately, exactly like a mic tap. Polled once from JS on mount/focus via
 * the Rust JNI bridge (android_take_pending_assist).
 */
object AssistBridgeHelper {
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
}
