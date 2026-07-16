package com.krishna.assistant

import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

class KrishnaInteractionSessionService : VoiceInteractionSessionService() {
  override fun onNewSession(args: android.os.Bundle?): VoiceInteractionSession =
    KrishnaInteractionSession(this)
}
