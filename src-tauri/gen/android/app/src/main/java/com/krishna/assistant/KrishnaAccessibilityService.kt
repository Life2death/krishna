package com.krishna.assistant

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale

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

    /** Click one uniquely matched, visible accessibility node by its user-facing label. */
    @JvmStatic
    fun clickButton(label: String): String = instance?.clickByLabel(label) ?: "SERVICE_UNAVAILABLE"

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

  private fun clickByLabel(label: String): String {
    val normalizedLabel = normalizeLabel(label)
    if (normalizedLabel.isEmpty() || normalizedLabel.length > 80) return "INVALID_LABEL"

    val root = rootInActiveWindow ?: return "NO_ACTIVE_WINDOW"
    val matches = mutableListOf<AccessibilityNodeInfo>()
    collectMatchingClickableNodes(root, normalizedLabel, matches)

    return when (matches.size) {
      0 -> "NOT_FOUND"
      1 -> if (matches.single().performAction(AccessibilityNodeInfo.ACTION_CLICK)) "CLICKED" else "CLICK_FAILED"
      else -> "AMBIGUOUS"
    }
  }

  private fun collectMatchingClickableNodes(
    node: AccessibilityNodeInfo,
    label: String,
    matches: MutableList<AccessibilityNodeInfo>,
  ) {
    if (node.isVisibleToUser && matchesLabel(node, label)) {
      clickableAncestor(node)?.let { candidate ->
        if (matches.none { it == candidate }) matches += candidate
      }
    }

    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child -> collectMatchingClickableNodes(child, label, matches) }
    }
  }

  private fun matchesLabel(node: AccessibilityNodeInfo, label: String): Boolean {
    val labels = listOfNotNull(
      node.text?.toString(),
      node.contentDescription?.toString(),
      node.viewIdResourceName?.substringAfterLast('/')?.replace('_', ' '),
    )
    return labels.any { normalizeLabel(it) == label }
  }

  private fun clickableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    var current: AccessibilityNodeInfo? = node
    repeat(8) {
      val candidate = current ?: return null
      if (candidate.isVisibleToUser && candidate.isEnabled && candidate.isClickable) return candidate
      current = candidate.parent
    }
    return null
  }

  private fun normalizeLabel(value: String): String = value
    .lowercase(Locale.US)
    .replace(Regex("\\s+"), " ")
    .trim()

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
