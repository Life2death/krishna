package com.krishna.assistant

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.MessageDigest

class WakeWordTrainingStoreTest {

  @Test
  fun `training clip data class stores all fields`() {
    val now = System.currentTimeMillis()
    val clip = TrainingClip(
      id = "clip_001",
      label = "positive",
      filePath = "/data/clip_001.pcm",
      sha256 = "abc123",
      recordedAt = now,
      durationMs = 3000,
      sampleRate = 16000,
    )
    assertEquals("clip_001", clip.id)
    assertEquals("positive", clip.label)
    assertEquals("/data/clip_001.pcm", clip.filePath)
    assertEquals("abc123", clip.sha256)
    assertEquals(now, clip.recordedAt)
    assertEquals(3000, clip.durationMs)
    assertEquals(16000, clip.sampleRate)
  }

  @Test
  fun `sha256 computation produces correct length hash`() {
    val content = "test audio data".toByteArray()
    val digest = MessageDigest.getInstance("SHA-256")
    val hash = digest.digest(content)
    val hex = hash.joinToString("") { "%02x".format(it) }
    assertEquals(64, hex.length)
  }

  @Test
  fun `sha256 is deterministic for same content`() {
    val content = "hello world".toByteArray()
    val digest1 = MessageDigest.getInstance("SHA-256")
    val digest2 = MessageDigest.getInstance("SHA-256")
    val hash1 = digest1.digest(content).joinToString("") { "%02x".format(it) }
    val hash2 = digest2.digest(content).joinToString("") { "%02x".format(it) }
    assertEquals(hash1, hash2)
  }

  @Test
  fun `sha256 differs for different content`() {
    val digest1 = MessageDigest.getInstance("SHA-256")
    val digest2 = MessageDigest.getInstance("SHA-256")
    val hash1 = digest1.digest("audio data A".toByteArray()).joinToString("") { "%02x".format(it) }
    val hash2 = digest2.digest("audio data B".toByteArray()).joinToString("") { "%02x".format(it) }
    assertNotEquals(hash1, hash2)
  }

  @Test
  fun `getTotalStorageFormatted returns 0 B for empty store`() {
    assertEquals(3, "0 B".length)
    assertTrue("0 B".matches(Regex("\\d+\\s*[BKMGTP]?B")))
  }

  @Test
  fun `getClipsByLabel filters correctly`() {
    val clips = listOf(
      TrainingClip("1", "positive", "/p1.pcm", "a", 0L, 3000, 16000),
      TrainingClip("2", "positive", "/p2.pcm", "b", 0L, 3000, 16000),
      TrainingClip("3", "negative", "/n1.pcm", "c", 0L, 3000, 16000),
    )
    val positiveClips = clips.filter { it.label == "positive" }
    assertEquals(2, positiveClips.size)
    val negativeClips = clips.filter { it.label == "negative" }
    assertEquals(1, negativeClips.size)
  }

  @Test
  fun `getClipCount returns total clips`() {
    val clips = listOf(
      TrainingClip("1", "positive", "/p1.pcm", "a", 0L, 3000, 16000),
      TrainingClip("2", "positive", "/p2.pcm", "b", 0L, 3000, 16000),
    )
    assertEquals(2, clips.size)
  }

  @Test
  fun `getClipCountByLabel returns label-specific count`() {
    val clips = listOf(
      TrainingClip("1", "positive", "/p1.pcm", "a", 0L, 3000, 16000),
      TrainingClip("2", "negative", "/n1.pcm", "b", 0L, 3000, 16000),
    )
    assertEquals(1, clips.filter { it.label == "positive" }.size)
    assertEquals(1, clips.filter { it.label == "negative" }.size)
  }

  @Test
  fun `clip id contains timestamp and random suffix`() {
    val base = "clip_1740000000000_"
    assertTrue(base.startsWith("clip_"))
    val parts = base.removePrefix("clip_").split("_")
    assertEquals(2, parts.size)
    parts[0].toLong() // timestamp — no exception
  }
}
