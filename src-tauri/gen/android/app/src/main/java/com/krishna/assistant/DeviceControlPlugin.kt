package com.krishna.assistant

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.*
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg internal class SetTorchArgs { var on: Boolean = false }
@InvokeArg internal class LaunchAppArgs { lateinit var packageName: String }
@InvokeArg internal class OpenSettingArgs { lateinit var name: String; var packageName: String? = null }
@InvokeArg internal class SetVolumeArgs { var stream: String = "music"; var level: Int = 0 }
@InvokeArg internal class SetDndArgs { var filter: String = "all" }

@TauriPlugin
class DeviceControlPlugin(private val activity: Activity) : Plugin(activity) {

  // ── Phase 1: No-permission commands ──────────────────────────────────

  @Command
  fun set_torch(invoke: Invoke) {
    val args = invoke.parseArgs(SetTorchArgs::class.java)
    try {
      val cm = activity.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val camId = cm.cameraIdList.firstOrNull { id ->
        cm.getCameraCharacteristics(id)
          .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      } ?: return invoke.reject("No camera with flash")
      cm.setTorchMode(camId, args.on)
      invoke.resolve(makeResult("ok" to true))
    } catch (e: Exception) { invoke.reject(e.message ?: "Failed to set torch") }
  }

  @Command
  fun list_apps(invoke: Invoke) {
    try {
      val pm = activity.packageManager
      val mainIntent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
      val activities = pm.queryIntentActivities(mainIntent, 0)
      val apps = JSONArray()
      for (ri in activities) {
        val name = ri.loadLabel(pm).toString()
        val pkg = ri.activityInfo.packageName
        apps.put(org.json.JSONObject().apply {
          put("name", name)
          put("packageName", pkg)
        })
      }
      invoke.resolve(makeResult("apps" to apps))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to list apps")
    }
  }

  @Command
  fun launch_app(invoke: Invoke) {
    val args = invoke.parseArgs(LaunchAppArgs::class.java)
    val intent = activity.packageManager.getLaunchIntentForPackage(args.packageName)
        ?: return invoke.reject("No launch intent for ${args.packageName}")
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    activity.startActivity(intent)
    invoke.resolve(makeResult("ok" to true))
  }

  @Command
  fun open_setting(invoke: Invoke) {
    val args = invoke.parseArgs(OpenSettingArgs::class.java)
    val intent = when (args.name.lowercase()) {
      "bluetooth"  -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
      "wifi"       -> Intent(Settings.ACTION_WIFI_SETTINGS)
      "location"   -> Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
      "airplane"   -> Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS)
      "nfc"        -> Intent(Settings.ACTION_NFC_SETTINGS)
      "sound"      -> Intent(Settings.ACTION_SOUND_SETTINGS)
      "battery"    -> Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
      "display"    -> Intent(Settings.ACTION_DISPLAY_SETTINGS)
      "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      "app_details" -> {
        val pkg = args.packageName ?: activity.packageName
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:$pkg")
        }
      }
      else -> Intent(Settings.ACTION_SETTINGS)
    }
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
      invoke.resolve(makeResult("ok" to true))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to open setting")
    }
  }

  @Command
  fun set_volume(invoke: Invoke) {
    val args = invoke.parseArgs(SetVolumeArgs::class.java)
    try {
      val am = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val streamType = when (args.stream.lowercase()) {
        "ring"    -> AudioManager.STREAM_RING
        "alarm"   -> AudioManager.STREAM_ALARM
        "notification" -> AudioManager.STREAM_NOTIFICATION
        "system"  -> AudioManager.STREAM_SYSTEM
        else      -> AudioManager.STREAM_MUSIC
      }
      val max = am.getStreamMaxVolume(streamType)
      val absLevel = (args.level * max / 100).coerceIn(0, max)
      am.setStreamVolume(streamType, absLevel, 0)
      invoke.resolve(makeResult("ok" to true))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to set volume")
    }
  }

  // ── Phase 2: DND ─────────────────────────────────────────────────────

  @Command
  fun set_dnd(invoke: Invoke) {
    val args = invoke.parseArgs(SetDndArgs::class.java)
    try {
      val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (!nm.isNotificationPolicyAccessGranted) {
        val ret = JSObject()
        ret.put("needsPermission", true)
        ret.put("ok", false)
        invoke.resolve(ret)
        return
      }
      when (args.filter.lowercase()) {
        "alarms_only"    -> nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS)
        "priority_only"  -> nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        "none"           -> nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
        else             -> nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
      }
      invoke.resolve(makeResult("ok" to true))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to set DND")
    }
  }

  @Command
  fun request_bluetooth_enable(invoke: Invoke) {
    try {
      val intent = Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
      invoke.resolve(makeResult("ok" to true))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to request Bluetooth enable")
    }
  }

  private fun makeResult(vararg pairs: Pair<String, Any?>): JSObject {
    val obj = JSObject()
    for ((k, v) in pairs) {
      when (v) {
        is Boolean -> obj.put(k, v)
        is Int -> obj.put(k, v)
        is Double -> obj.put(k, v)
        is String -> obj.put(k, v)
        is org.json.JSONArray -> obj.put(k, v)
        is org.json.JSONObject -> obj.put(k, v)
        else -> obj.put(k, v?.toString() ?: JSONObject.NULL)
      }
    }
    return obj
  }
}
