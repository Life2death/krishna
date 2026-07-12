package com.krishna.assistant

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Native Android Text-To-Speech, called from Rust via JNI.
 *
 * The Android WebView has no `window.speechSynthesis`, and the desktop Piper
 * engine spawns an x86 `piper.exe` subprocess that can't run on Android — so
 * mobile has no in-WebView TTS path. This bridges to the platform TextToSpeech
 * engine instead.
 *
 * TextToSpeech must be constructed and driven on a thread with a Looper, so all
 * work is posted to the main thread. Engine init is async: utterances requested
 * before init completes are queued and flushed once it's ready.
 */
object TtsHelper {
  private const val UTTERANCE_ID = "krishna"

  private val main = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var ready = false
  private val pending = ArrayDeque<String>()

  @JvmStatic
  fun speak(context: Context, text: String) {
    val appCtx = context.applicationContext
    main.post {
      if (tts == null) {
        tts = TextToSpeech(appCtx) { status ->
          // Init callback already runs on the main thread.
          ready = status == TextToSpeech.SUCCESS
          if (ready) {
            tts?.language = Locale.US
            while (pending.isNotEmpty()) {
              tts?.speak(pending.removeFirst(), TextToSpeech.QUEUE_ADD, null, UTTERANCE_ID)
            }
          } else {
            pending.clear()
          }
        }
      }

      if (ready) {
        // QUEUE_ADD: the frontend streams a reply sentence-by-sentence, so each
        // call appends and they play in order. Barge-in / a new command clears
        // the queue via stop().
        tts?.speak(text, TextToSpeech.QUEUE_ADD, null, UTTERANCE_ID)
      } else {
        pending.addLast(text)
      }
    }
  }

  @JvmStatic
  fun stop() {
    main.post {
      pending.clear()
      tts?.stop()
    }
  }
}
