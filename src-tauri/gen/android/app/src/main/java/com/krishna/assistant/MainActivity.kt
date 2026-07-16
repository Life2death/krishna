package com.krishna.assistant

import android.app.ActivityManager
import android.content.Context
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  companion object {
    @Volatile
    private var liveInstance: MainActivity? = null

    /** Is an instance of MainActivity currently alive in this process? */
    @JvmStatic
    fun isAlive(): Boolean = liveInstance != null

    /**
     * Bring the already-running instance's task to front instead of letting
     * a caller start a second one. Tauri/wry does not tolerate two
     * concurrent Activity instances in one process (observed: the second
     * instance's WebView never renders — persistent blank screen, no
     * crash). See VOICE_INTERACTION_ASSISTANT_PLAN.md Phase 0.
     */
    @JvmStatic
    fun bringToFront(context: Context) {
      val instance = liveInstance ?: return
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      am.moveTaskToFront(instance.taskId, 0)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    liveInstance = this
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onDestroy() {
    if (liveInstance === this) liveInstance = null
    super.onDestroy()
  }
}
