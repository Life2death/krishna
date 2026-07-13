package com.krishna.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import java.util.Locale

class KrishnaHandsFreeService : Service(), RecognitionListener {
  companion object {
    private const val TAG = "KrishnaHandsFree"
    private const val CHANNEL_ID = "krishna_hands_free"
    private const val NOTIFICATION_ID = 4101
    private const val ACTION_START = "com.krishna.assistant.HANDS_FREE_START"
    private const val ACTION_STOP = "com.krishna.assistant.HANDS_FREE_STOP"

    @JvmStatic
    fun start(context: Context): Boolean {
      val intent = Intent(context, KrishnaHandsFreeService::class.java).setAction(ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      return true
    }

    @JvmStatic
    fun stop(context: Context): Boolean {
      context.stopService(Intent(context, KrishnaHandsFreeService::class.java))
      return true
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var destroyed = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    startForeground(NOTIFICATION_ID, createNotification())
    ensureRecognizer()
    scheduleListening(0)
    return START_STICKY
  }

  override fun onDestroy() {
    destroyed = true
    handler.removeCallbacksAndMessages(null)
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    super.onDestroy()
  }

  private fun ensureRecognizer() {
    if (recognizer != null || !SpeechRecognizer.isRecognitionAvailable(this)) return
    recognizer = SpeechRecognizer.createSpeechRecognizer(this).also { it.setRecognitionListener(this) }
  }

  private fun scheduleListening(delayMs: Long) {
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({
      if (destroyed || recognizer == null) return@postDelayed
      try {
        recognizer?.startListening(
          Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        )
      } catch (error: Exception) {
        Log.w(TAG, "Unable to start recognition", error)
        scheduleListening(1_500)
      }
    }, delayMs)
  }

  override fun onResults(results: android.os.Bundle?) {
    val phrases = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
    phrases.firstOrNull()?.let(::handleTranscript)
    scheduleListening(350)
  }

  override fun onError(error: Int) {
    val delay = if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) 5_000L else 700L
    Log.d(TAG, "Recognition ended with error $error")
    scheduleListening(delay)
  }

  private fun handleTranscript(transcript: String) {
    val command = transcript
      .lowercase(Locale.US)
      .replace(Regex("^\\s*(?:hey\\s+)?krishna\\b[,.!\\s]*"), "")
      .trim()
    if (command == transcript.lowercase(Locale.US).trim() || command.isEmpty()) return

    val gesture = when {
      command.contains("zoom in") -> "zoom_in"
      command.contains("zoom out") -> "zoom_out"
      command.contains("scroll down") || command.contains("swipe up") -> "swipe_up"
      command.contains("scroll up") || command.contains("swipe down") -> "swipe_down"
      command.contains("swipe left") -> "swipe_left"
      command.contains("swipe right") -> "swipe_right"
      command == "go back" || command == "back" -> "back"
      command == "go home" || command == "home" -> "home"
      command.contains("recent") -> "recents"
      else -> null
    } ?: return

    val dispatched = KrishnaAccessibilityService.gesture(gesture)
    Log.i(TAG, "Command '$command' -> $gesture dispatched=$dispatched")
  }

  private fun createNotification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Krishna hands-free", NotificationManager.IMPORTANCE_LOW)
      )
    }
    return Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Krishna hands-free is active")
      .setContentText("Listening for ‘Hey Krishna’ commands")
      .setOngoing(true)
      .build()
  }

  override fun onReadyForSpeech(params: android.os.Bundle?) = Unit
  override fun onBeginningOfSpeech() = Unit
  override fun onRmsChanged(rmsdB: Float) = Unit
  override fun onBufferReceived(buffer: ByteArray?) = Unit
  override fun onEndOfSpeech() = Unit
  override fun onPartialResults(partialResults: android.os.Bundle?) = Unit
  override fun onEvent(eventType: Int, params: android.os.Bundle?) = Unit
}
