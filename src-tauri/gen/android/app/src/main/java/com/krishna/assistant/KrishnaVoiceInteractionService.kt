package com.krishna.assistant

import android.service.voice.VoiceInteractionService
import android.util.Log

/**
 * System Digital Assistant entry point (v1). Holding ROLE_ASSISTANT lets a
 * long-press-home/assist gesture from ANY app bind this service at
 * foreground/visible process importance and hand off to
 * KrishnaInteractionSessionService — no always-on foreground service needed
 * for the invoke path itself. See VOICE_INTERACTION_ASSISTANT_PLAN.md.
 */
class KrishnaVoiceInteractionService : VoiceInteractionService() {
  companion object {
    private const val TAG = "KrishnaVIS"
  }

  override fun onReady() {
    super.onReady()
    Log.i(TAG, "onReady")
  }
}
