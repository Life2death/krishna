package com.krishna.assistant

import android.content.Context
import android.media.MediaRecorder
import android.os.Environment
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

data class TrainingClip(
  val id: String,
  val label: String,
  val filePath: String,
  val sha256: String,
  val recordedAt: Long,
  val durationMs: Long,
  val sampleRate: Int,
)

class WakeWordTrainingStore(context: Context) {
  companion object {
    private const val TAG = "WakeWordTraining"
    private const val CLIPS_DIR = "wake_word_training"
    private const val MAX_CLIPS = 500
  }

  private val clipsDir: File

  init {
    clipsDir = File(context.filesDir, CLIPS_DIR)
    if (!clipsDir.exists()) {
      clipsDir.mkdirs()
    }
  }

  fun recordTrainingClip(
    label: String,
    sampleRate: Int = 16000,
    durationMs: Long = 3000,
  ): TrainingClip? {
    if (getClipCount() >= MAX_CLIPS) {
      Log.w(TAG, "Maximum training clips reached ($MAX_CLIPS)")
      return null
    }
    val id = "clip_${System.currentTimeMillis()}_${(1000..9999).random()}"
    val file = File(clipsDir, "${id}.pcm")
    return try {
      val recorder = MediaRecorder()
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      recorder.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
      recorder.setAudioSamplingRate(sampleRate)
      recorder.setOutputFile(file.absolutePath)
      recorder.prepare()
      recorder.start()
      Thread.sleep(durationMs)
      recorder.stop()
      recorder.release()

      val sha256 = computeSha256(file)
      val clip = TrainingClip(
        id = id,
        label = label,
        filePath = file.absolutePath,
        sha256 = sha256,
        recordedAt = System.currentTimeMillis(),
        durationMs = durationMs,
        sampleRate = sampleRate,
      )
      Log.i(TAG, "Recorded training clip: $id label=$label path=${file.absolutePath}")
      clip
    } catch (e: Exception) {
      Log.e(TAG, "Failed to record training clip", e)
      null
    }
  }

  fun getClips(): List<TrainingClip> {
    val files = clipsDir.listFiles() ?: return emptyList()
    return files.filter { it.extension == "pcm" || it.extension == "wav" }
      .mapNotNull { file ->
        val parts = file.nameWithoutExtension.split("_")
        if (parts.size < 2) return@mapNotNull null
        val id = file.nameWithoutExtension
        val label = readLabel(file) ?: "unknown"
        TrainingClip(
          id = id,
          label = label,
          filePath = file.absolutePath,
          sha256 = computeSha256(file),
          recordedAt = file.lastModified(),
          durationMs = 3000,
          sampleRate = 16000,
        )
      }
  }

  fun getClipsByLabel(label: String): List<TrainingClip> = getClips().filter { it.label == label }

  fun getClipCount(): Int = getClips().size

  fun getClipCountByLabel(label: String): Int = getClipsByLabel(label).size

  fun getTotalStorageBytes(): Long {
    val files = clipsDir.listFiles() ?: return 0L
    return files.sumOf { it.length() }
  }

  fun getTotalStorageFormatted(): String {
    val bytes = getTotalStorageBytes()
    return when {
      bytes < 1024 -> "$bytes B"
      bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
      else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
  }

  fun deleteClip(id: String): Boolean {
    val file = File(clipsDir, "$id.pcm")
    val deleted = file.delete()
    if (deleted) Log.i(TAG, "Deleted training clip: $id")
    return deleted
  }

  fun deleteAllClips(): Int {
    val files = clipsDir.listFiles() ?: return 0
    var count = 0
    for (file in files) {
      if (file.delete()) count++
    }
    Log.i(TAG, "Deleted $count training clips")
    return count
  }

  private fun readLabel(file: File): String? {
    return try {
      val labelFile = File(clipsDir, "${file.nameWithoutExtension}.label")
      if (labelFile.exists()) labelFile.readText().trim() else null
    } catch (e: Exception) {
      null
    }
  }

  internal fun computeSha256(file: File): String {
    return try {
      val digest = MessageDigest.getInstance("SHA-256")
      val bytes = file.readBytes()
      val hash = digest.digest(bytes)
      hash.joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to compute SHA-256 for ${file.name}", e)
      ""
    }
  }
}
