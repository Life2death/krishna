package com.krishna.assistant

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent

/**
 * Voice-driven gestures on whatever app is on screen (Phase C).
 * The user must enable this service once: Settings → Accessibility → Krishna.
 *
 * Called from Rust via the JVM-static companion (same JNI pattern as
 * TtsHelper) — the live service instance registers itself on connect.
 */
class KrishnaAccessibilityService : AccessibilityService() {

  companion object {
    @Volatile
    private var instance: KrishnaAccessibilityService? = null

    @JvmStatic
    fun isEnabled(): Boolean = instance != null

    /** Fire a gesture/global action. Returns false when unknown or not dispatched. */
    @JvmStatic
    fun gesture(kind: String): Boolean = instance?.perform(kind) ?: false

    /** Open the system Accessibility settings so the user can enable the service. */
    @JvmStatic
    fun openSettings(context: Context) {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* gestures only */ }

  override fun onInterrupt() {}

  private fun perform(kind: String): Boolean {
    val dm = resources.displayMetrics
    val w = dm.widthPixels.toFloat()
    val h = dm.heightPixels.toFloat()
    return when (kind) {
      "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
      "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
      "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
      "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
      "tap" -> tap(w / 2f, h / 2f)
      "swipe_up" -> swipe(w / 2f, h * 0.70f, w / 2f, h * 0.30f)
      "swipe_down" -> swipe(w / 2f, h * 0.30f, w / 2f, h * 0.70f)
      "swipe_left" -> swipe(w * 0.75f, h / 2f, w * 0.25f, h / 2f)
      "swipe_right" -> swipe(w * 0.25f, h / 2f, w * 0.75f, h / 2f)
      "zoom_in" -> pinch(w, h, outward = true)
      "zoom_out" -> pinch(w, h, outward = false)
      else -> false
    }
  }

  private fun tap(x: Float, y: Float): Boolean {
    val path = Path().apply { moveTo(x, y) }
    val stroke = GestureDescription.StrokeDescription(path, 0, 80)
    return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
  }

  private fun swipe(x1: Float, y1: Float, x2: Float, y2: Float): Boolean {
    val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
    val stroke = GestureDescription.StrokeDescription(path, 0, 300)
    return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
  }

  /** Two-finger pinch around the screen centre (maps zoom in/out). */
  private fun pinch(w: Float, h: Float, outward: Boolean): Boolean {
    val cx = w / 2f
    val cy = h / 2f
    val near = h * 0.06f
    val far = h * 0.24f
    val (startOffset, endOffset) = if (outward) near to far else far to near

    val top = Path().apply { moveTo(cx, cy - startOffset); lineTo(cx, cy - endOffset) }
    val bottom = Path().apply { moveTo(cx, cy + startOffset); lineTo(cx, cy + endOffset) }

    val builder = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(top, 0, 350))
      .addStroke(GestureDescription.StrokeDescription(bottom, 0, 350))
    return dispatchGesture(builder.build(), null, null)
  }
}
