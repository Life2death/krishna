package com.krishna.assistant

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.view.KeyEvent

/**
 * Media / device controls, called from Rust via JNI (same pattern as TtsHelper).
 * Volume, media transport keys, and torch. No special permissions required:
 * setTorchMode and AudioManager volume/media-key APIs are permission-free.
 */
object MediaControlHelper {
  private fun audio(context: Context): AudioManager =
    context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /** action: "up" | "down" | "mute" | "unmute" | "set" (value = 0-100 percent for "set") */
  @JvmStatic
  fun volume(context: Context, action: String, value: Int): Boolean {
    val am = audio(context)
    val stream = AudioManager.STREAM_MUSIC
    when (action) {
      "up" -> am.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
      "down" -> am.adjustStreamVolume(stream, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
      "mute" -> am.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
      "unmute" -> am.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI)
      "set" -> {
        val max = am.getStreamMaxVolume(stream)
        val target = (value.coerceIn(0, 100) * max) / 100
        am.setStreamVolume(stream, target, AudioManager.FLAG_SHOW_UI)
      }
      else -> return false
    }
    return true
  }

  /** action: "play_pause" | "play" | "pause" | "next" | "previous" | "stop" */
  @JvmStatic
  fun mediaKey(context: Context, action: String): Boolean {
    val code = when (action) {
      "play_pause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
      "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
      "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
      "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
      "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
      "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
      else -> return false
    }
    val am = audio(context)
    am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
    am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
    return true
  }

  /** Torch on/off on the first back camera with a flash unit. */
  @JvmStatic
  fun setTorch(context: Context, on: Boolean): Boolean {
    val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    for (id in cm.cameraIdList) {
      val chars = cm.getCameraCharacteristics(id)
      val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      val backFacing =
        chars.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
      if (hasFlash && backFacing) {
        cm.setTorchMode(id, on)
        return true
      }
    }
    return false
  }
}
