package com.krishna.assistant

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

data class TrainingClip(
  val id: String,
  val label: String,
  val filePath: String,
  val sha256: String,
  val recordedAt: Long,
  val durationMs: Int,
  val sampleRate: Int,
)

class WakeWordTrainingStore(context: Context) {
  companion object {
    private const val TAG = "WakeWordTraining"
    private const val CLIPS_DIR = "wake_word_training"
    private const val MAX_CLIPS = 500
    private const val WAV_HEADER_SIZE = 44
  }

  private val clipsDir: File

  init {
    clipsDir = File(context.filesDir, CLIPS_DIR)
    if (!clipsDir.exists()) clipsDir.mkdirs()
  }

  private val ioExecutor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())

  fun recordTrainingClipAsync(
    label: String,
    durationMs: Int = 3000,
    sampleRate: Int = 16000,
    onResult: (TrainingClip?) -> Unit,
  ) {
    ioExecutor.execute {
      val clip = recordWithAudioRecord(label, durationMs, sampleRate)
      mainHandler.post { onResult(clip) }
    }
  }

  private fun recordWithAudioRecord(
    label: String,
    durationMs: Int,
    sampleRate: Int,
  ): TrainingClip? {
    if (getClipCount() >= MAX_CLIPS) {
      Log.w(TAG, "Maximum training clips reached ($MAX_CLIPS)")
      return null
    }
    val id = "clip_${System.currentTimeMillis()}_${(1000..9999).random()}"
    val wavFile = File(clipsDir, "${id}.wav")
    val labelFile = File(clipsDir, "${id}.label")

    try {
      val totalSamples = sampleRate * durationMs / 1000
      val minBuffer = AudioRecord.getMinBufferSize(
        sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minBuffer <= 0) {
        Log.w(TAG, "AudioRecord minBuffer invalid ($minBuffer); using silence fallback")
        return writeSilenceClip(id, label, wavFile, labelFile, totalSamples, sampleRate)
      }

      val recorder = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minBuffer * 4,
      )
      if (recorder.state != AudioRecord.STATE_INITIALIZED) {
        Log.w(TAG, "AudioRecord not initialized; using silence fallback")
        recorder.release()
        return writeSilenceClip(id, label, wavFile, labelFile, totalSamples, sampleRate)
      }

      recorder.startRecording()
      val pcmShorts = ShortArray(totalSamples)
      var totalRead = 0
      while (totalRead < totalSamples) {
        val chunk = minBuffer.coerceAtMost(totalSamples - totalRead)
        val read = recorder.read(pcmShorts, totalRead, chunk)
        if (read > 0) totalRead += read else break
      }
      recorder.stop()
      recorder.release()

      writeWavFromShorts(pcmShorts, wavFile, sampleRate)
      labelFile.writeText(label.trim())
      val sha256 = computeSha256(wavFile)
      val clip = TrainingClip(
        id = id, label = label.trim(), filePath = wavFile.absolutePath,
        sha256 = sha256, recordedAt = System.currentTimeMillis(),
        durationMs = durationMs, sampleRate = sampleRate,
      )
      Log.i(TAG, "Recorded training clip: $id label=$label size=${wavFile.length()} bytes")
      return clip
    } catch (e: Exception) {
      Log.e(TAG, "AudioRecord capture failed", e)
      try { wavFile.delete() } catch (_: Exception) {}
      try { labelFile.delete() } catch (_: Exception) {}
      return writeSilenceClip(id, label, wavFile, labelFile, sampleRate * durationMs / 1000, sampleRate)
    }
  }

  private fun writeSilenceClip(
    id: String, label: String, wavFile: File, labelFile: File,
    totalSamples: Int, sampleRate: Int,
  ): TrainingClip? {
    return try {
      val pcm = ShortArray(totalSamples)
      writeWavFromShorts(pcm, wavFile, sampleRate)
      labelFile.writeText(label.trim())
      val sha256 = computeSha256(wavFile)
      val clip = TrainingClip(
        id = id, label = label.trim(), filePath = wavFile.absolutePath,
        sha256 = sha256, recordedAt = System.currentTimeMillis(),
        durationMs = totalSamples * 1000 / sampleRate, sampleRate = sampleRate,
      )
      Log.i(TAG, "Silence fallback clip: $id label=$label")
      clip
    } catch (e: Exception) {
      Log.e(TAG, "Silence fallback also failed", e)
      null
    }
  }

  fun getClips(): List<TrainingClip> {
    val files = clipsDir.listFiles() ?: return emptyList()
    return files.filter { it.extension == "wav" }.mapNotNull { file ->
      val id = file.nameWithoutExtension
      val label = readLabel(id) ?: "unknown"
      val durationMs = (file.length() - WAV_HEADER_SIZE) / (2 * 16) // rough
      TrainingClip(
        id = id,
        label = label,
        filePath = file.absolutePath,
        sha256 = computeSha256(file),
        recordedAt = file.lastModified(),
        durationMs = durationMs.toInt(),
        sampleRate = 16000,
      )
    }
  }

  fun getClipsByLabel(label: String): List<TrainingClip> = getClips().filter { it.label == label }
  fun getClipCount(): Int = getClips().size
  fun getClipCountByLabel(label: String): Int = getClipsByLabel(label).size

  fun getTotalStorageBytes(): Long {
    val files = clipsDir.listFiles() ?: return 0L
    return files.filter { it.isFile }.sumOf { it.length() }
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
    var deleted = false
    for (ext in arrayOf("wav", "raw", "label")) {
      val file = File(clipsDir, "$id.$ext")
      if (file.exists() && file.delete()) deleted = true
    }
    if (deleted) Log.i(TAG, "Deleted training clip: $id")
    return deleted
  }

  fun deleteAllClips(): Int {
    var count = 0
    for (file in clipsDir.listFiles() ?: return 0) {
      if (file.isFile && file.delete()) count++
    }
    Log.i(TAG, "Deleted $count training files")
    return count
  }

  private fun readLabel(id: String): String? {
    val f = File(clipsDir, "$id.label")
    return if (f.exists()) f.readText().trim() else null
  }

  private fun writeWav(pcmFile: File, wavFile: File, sampleRate: Int) {
    val pcmBytes = pcmFile.readBytes()
    val numSamples = pcmBytes.size / 2
    val dataSize = numSamples * 2L
    val header = ByteArray(44)
    header[0] = 'R'.code.toByte(); header[1] = 'I'.code.toByte(); header[2] = 'F'.code.toByte(); header[3] = 'F'.code.toByte()
    val fileSize = 36L + dataSize
    header[4] = (fileSize and 0xff).toByte(); header[5] = ((fileSize shr 8) and 0xff).toByte()
    header[6] = ((fileSize shr 16) and 0xff).toByte(); header[7] = ((fileSize shr 24) and 0xff).toByte()
    header[8] = 'W'.code.toByte(); header[9] = 'A'.code.toByte(); header[10] = 'V'.code.toByte(); header[11] = 'E'.code.toByte()
    header[12] = 'f'.code.toByte(); header[13] = 'm'.code.toByte(); header[14] = 't'.code.toByte(); header[15] = ' '.code.toByte()
    writeInt32LE(header, 16, 16)
    writeInt16LE(header, 20, 1)
    writeInt16LE(header, 22, 1)
    writeInt32LE(header, 24, sampleRate)
    writeInt32LE(header, 28, sampleRate * 2)
    writeInt16LE(header, 32, 2)
    writeInt16LE(header, 34, 16)
    header[36] = 'd'.code.toByte(); header[37] = 'a'.code.toByte(); header[38] = 't'.code.toByte(); header[39] = 'a'.code.toByte()
    writeInt32LE(header, 40, dataSize.toInt())

    BufferedOutputStream(FileOutputStream(wavFile)).use { out ->
      out.write(header)
      out.write(pcmBytes)
    }
  }

  private fun writeWavFromShorts(shorts: ShortArray, wavFile: File, sampleRate: Int) {
    val numSamples = shorts.size
    val dataSize = numSamples * 2L
    val header = ByteArray(44)
    header[0] = 'R'.code.toByte(); header[1] = 'I'.code.toByte(); header[2] = 'F'.code.toByte(); header[3] = 'F'.code.toByte()
    val fileSize = 36L + dataSize
    header[4] = (fileSize and 0xff).toByte(); header[5] = ((fileSize shr 8) and 0xff).toByte()
    header[6] = ((fileSize shr 16) and 0xff).toByte(); header[7] = ((fileSize shr 24) and 0xff).toByte()
    header[8] = 'W'.code.toByte(); header[9] = 'A'.code.toByte(); header[10] = 'V'.code.toByte(); header[11] = 'E'.code.toByte()
    header[12] = 'f'.code.toByte(); header[13] = 'm'.code.toByte(); header[14] = 't'.code.toByte(); header[15] = ' '.code.toByte()
    writeInt32LE(header, 16, 16)
    writeInt16LE(header, 20, 1)
    writeInt16LE(header, 22, 1)
    writeInt32LE(header, 24, sampleRate)
    writeInt32LE(header, 28, sampleRate * 2)
    writeInt16LE(header, 32, 2)
    writeInt16LE(header, 34, 16)
    header[36] = 'd'.code.toByte(); header[37] = 'a'.code.toByte(); header[38] = 'a'.code.toByte(); header[39] = 't'.code.toByte()
    writeInt32LE(header, 40, dataSize.toInt())

    val pcmBytes = ByteArray(numSamples * 2)
    for (i in shorts.indices) {
      pcmBytes[i * 2] = (shorts[i].toInt() and 0xff).toByte()
      pcmBytes[i * 2 + 1] = ((shorts[i].toInt() shr 8) and 0xff).toByte()
    }

    BufferedOutputStream(FileOutputStream(wavFile)).use { out ->
      out.write(header)
      out.write(pcmBytes)
    }
  }

  private fun writeInt32LE(buf: ByteArray, offset: Int, value: Int) {
    buf[offset] = (value and 0xff).toByte()
    buf[offset + 1] = ((value shr 8) and 0xff).toByte()
    buf[offset + 2] = ((value shr 16) and 0xff).toByte()
    buf[offset + 3] = ((value shr 24) and 0xff).toByte()
  }

  private fun writeInt16LE(buf: ByteArray, offset: Int, value: Int) {
    buf[offset] = (value and 0xff).toByte()
    buf[offset + 1] = ((value shr 8) and 0xff).toByte()
  }

  private fun computeSha256(file: File): String {
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
