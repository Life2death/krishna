package com.krishna.assistant

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionService
import android.speech.SpeechRecognizer

/**
 * Never actually used — the VoiceInteractionService XML requires a
 * recognitionService to be listed or the system rejects/ignores the whole
 * VIS registration. Krishna's real STT stays on the existing SpeechRecognizer
 * / hands-free path; this stub only satisfies that manifest requirement.
 */
class KrishnaRecognitionServiceStub : RecognitionService() {
  override fun onStartListening(recognizerIntent: Intent?, listener: Callback?) {
    listener?.error(SpeechRecognizer.ERROR_CLIENT)
  }

  override fun onStopListening(listener: Callback?) {}

  override fun onCancel(listener: Callback?) {}
}
