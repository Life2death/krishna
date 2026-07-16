package com.krishna.assistant

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.Log

/**
 * v1: no session UI of our own. onShow() marks an assist as pending and
 * bounces straight to MainActivity (already at TOP via startAssistantActivity,
 * so FGS/mic starts are permitted) which then auto-starts listening exactly
 * like a mic tap. See VOICE_INTERACTION_ASSISTANT_PLAN.md Phase 1/2.
 */
class KrishnaInteractionSession(context: Context) : VoiceInteractionSession(context) {
  companion object {
    private const val TAG = "KrishnaSession"
    const val EXTRA_ASSIST_TRIGGER = "com.krishna.assistant.EXTRA_ASSIST_TRIGGER"
  }

  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    try {
      AssistBridgeHelper.setPending()

      if (MainActivity.isAlive()) {
        // Already running (e.g. opened normally from the launcher).
        // startAssistantActivity() unconditionally creates a SECOND,
        // concurrent MainActivity instance in a distinct ACTIVITY_TYPE_
        // ASSISTANT task even when one is already alive (confirmed
        // on-device — intent flags don't change this platform behavior),
        // which breaks Tauri/wry's single-activity assumptions (persistent
        // blank WebView, no crash). Bring the existing task forward
        // instead — its window regaining focus re-triggers useAssistTrigger
        // the same way a fresh assist launch would.
        MainActivity.bringToFront(context)
        Log.i(TAG, "onShow: brought existing MainActivity to front")
      } else {
        val intent = Intent(context, MainActivity::class.java).apply {
          putExtra(EXTRA_ASSIST_TRIGGER, true)
        }
        startAssistantActivity(intent)
        Log.i(TAG, "onShow: startAssistantActivity dispatched")
      }
    } catch (e: Exception) {
      Log.e(TAG, "onShow failed", e)
    } finally {
      hide()
    }
  }
}
