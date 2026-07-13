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
    private const val USE_SHERP_DEV_SWITCH = false

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
  private var owwDetector: OpenWakeWordDetector? = null
  private var sherpaDetector: SherpaWakeWordDetector? = null
  private var destroyed = false
  private var wakeDetectorActive = false

  private val safeDirectButtons = setOf(
    "play", "pause", "next", "previous", "search", "close", "cancel", "dismiss", "skip", "retry",
  )

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    startForeground(NOTIFICATION_ID, createNotification())
    ensureRecognizer()
    startWakeWordDetection()
    return START_STICKY
  }

  override fun onDestroy() {
    destroyed = true
    handler.removeCallbacksAndMessages(null)
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    owwDetector?.release()
    owwDetector = null
    sherpaDetector?.release()
    sherpaDetector = null
    super.onDestroy()
  }

  private fun ensureRecognizer() {
    if (recognizer != null || !SpeechRecognizer.isRecognitionAvailable(this)) return
    recognizer = SpeechRecognizer.createSpeechRecognizer(this).also { it.setRecognitionListener(this) }
  }

  private fun startWakeWordDetection(delayMs: Long = 0) {
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({
      if (destroyed) return@postDelayed
      wakeDetectorActive = true
      val profile = WakeWordProfileStore(this).load()
      if (profile.enabled && profile.activationApprovedAt > 0L) {
        startOpenWakeWord()
      } else if (USE_SHERP_DEV_SWITCH && SherpaWakeWordDetector.isAvailable(this)) {
        startSherpaDetector()
      } else {
        startDirectRecognition()
      }
    }, delayMs)
  }

  private fun startOpenWakeWord() {
    try {
      if (owwDetector == null) {
        owwDetector = OpenWakeWordDetector(this) {
          handler.post(::startCommandRecognition)
        }
      }
      if (owwDetector?.start() != true) {
        Log.w(TAG, "OpenWakeWord unavailable, falling back to direct recognition")
        startDirectRecognition()
      }
    } catch (error: Exception) {
      Log.e(TAG, "Unable to start OpenWakeWord detector", error)
      startDirectRecognition()
    }
  }

  private fun startSherpaDetector() {
    try {
      if (sherpaDetector == null) {
        sherpaDetector = SherpaWakeWordDetector(this) {
          handler.post(::startCommandRecognition)
        }
      }
      if (sherpaDetector?.start() != true) {
        Log.w(TAG, "Sherpa unavailable")
        startDirectRecognition()
      }
    } catch (error: Exception) {
      Log.e(TAG, "Unable to start Sherpa detector", error)
      startDirectRecognition()
    }
  }

  private fun startDirectRecognition() {
    Log.d(TAG, "Starting direct speech recognition (no wake-word gate)")
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
        startDirectRecognition()
      }
    }, 100)
  }

  private fun startCommandRecognition() {
    if (destroyed) return
    wakeDetectorActive = false
    owwDetector?.stop()
    sherpaDetector?.stop()
    ensureRecognizer()
    try {
      recognizer?.startListening(
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
          .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
          .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      )
    } catch (error: Exception) {
      Log.w(TAG, "Unable to start command recognition", error)
      startWakeWordDetection(1_500)
    }
  }

  override fun onResults(results: android.os.Bundle?) {
    val phrases = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
    phrases.firstOrNull()?.let(::handleTranscript)
    startWakeWordDetection(350)
  }

  override fun onError(error: Int) {
    val delay = if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) 5_000L else 700L
    Log.d(TAG, "Recognition ended with error $error")
    startWakeWordDetection(delay)
  }

  private fun handleTranscript(transcript: String) {
    val command = transcript
      .lowercase(Locale.US)
      .replace(Regex("^\\s*(?:hey\\s+)?krishna\\b[,.!\\s]*"), "")
      .trim()
    if (command.isEmpty()) return

    HandsFreeCommandParser.extractButtonLabel(command)?.let { label ->
      if (label !in safeDirectButtons) {
        Log.w(TAG, "Blocked direct click for non-safe label '$label'")
        return
      }
      val result = KrishnaAccessibilityService.clickButton(label)
      Log.i(TAG, "Command '$command' -> click '$label' result=$result")
      return
    }

    HandsFreeCommandParser.extractMediaAction(command)?.let { action ->
      val dispatched = MediaControlHelper.mediaKey(this, action)
      Log.i(TAG, "Command '$command' -> media '$action' dispatched=$dispatched")
      return
    }

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
      .setContentText("Listening for 'Hey Krishna' commands")
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

internal object HandsFreeCommandParser {
  private val buttonCommand = Regex("^(?:click|tap|press|select)\\s+(.+)$")
  private val leadingButtonWords = Regex("^(?:(?:on|the)\\s+)+")
  private val trailingButtonWords = Regex("\\s+(?:button|control|icon)\\s*$")

  fun extractButtonLabel(command: String): String? {
    val match = buttonCommand.matchEntire(command) ?: return null
    val label = match.groupValues[1]
      .replace(leadingButtonWords, "")
      .replace(trailingButtonWords, "")
      .trim()
      .lowercase(Locale.US)
    return label.takeIf { it.isNotEmpty() && it !in setOf("button", "control", "icon") }
  }

  fun extractMediaAction(command: String): String? = when (command) {
    "play", "play music", "play the music", "play song", "play the song",
    "resume", "resume music", "resume the music", "resume song", "resume the song",
    "continue", "continue music", "continue the music", "continue the song" -> "play"
    "pause", "pause music", "pause the music", "pause song", "pause the song" -> "pause"
    "next", "next song", "skip", "skip song" -> "next"
    "previous", "previous song", "go back a song" -> "previous"
    else -> null
  }
}
