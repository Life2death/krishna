package com.krishna.assistant

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/**
 * Voice app-launcher, called from Rust via JNI (same pattern as TtsHelper).
 * Lists launchable apps (label + package) and launches one by package name.
 * Name→package matching lives on the Rust side.
 */
object AppLauncherHelper {
  /** JSON array of {label, package} for every app with a launcher activity. */
  @JvmStatic
  fun listApps(context: Context): String {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val activities = pm.queryIntentActivities(intent, 0)
    val arr = JSONArray()
    val seen = HashSet<String>()
    for (info in activities) {
      val pkg = info.activityInfo.packageName
      if (!seen.add(pkg)) continue
      arr.put(
        JSONObject()
          .put("label", info.loadLabel(pm).toString())
          .put("package", pkg)
      )
    }
    return arr.toString()
  }

  /** Launch an app by package name. Returns false if it has no launch intent. */
  @JvmStatic
  fun launchApp(context: Context, packageName: String): Boolean {
    val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
    return true
  }
}
