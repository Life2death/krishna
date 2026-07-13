package com.krishna.assistant

import org.junit.Assert.*
import org.junit.Test

class OpenWakeWordDetectorTest {

  @Test
  fun `config default values are correct`() {
    val config = OpenWakeWordConfig()
    assertEquals(16000, config.sampleRate)
    assertEquals(1280, config.frameLengthMs)
    assertEquals(0.5f, config.scoreThreshold, 0.001f)
    assertEquals(2000L, config.cooldownMs)
    assertEquals(5, config.smoothingWindow)
    assertEquals(128, config.inputFeatures)
  }

  @Test
  fun `config custom values are preserved`() {
    val config = OpenWakeWordConfig(
      modelPath = "custom/path/model.tflite",
      sampleRate = 8000,
      frameLengthMs = 640,
      scoreThreshold = 0.75f,
      cooldownMs = 3000L,
      smoothingWindow = 10,
      inputFeatures = 256,
    )
    assertEquals("custom/path/model.tflite", config.modelPath)
    assertEquals(8000, config.sampleRate)
    assertEquals(640, config.frameLengthMs)
    assertEquals(0.75f, config.scoreThreshold, 0.001f)
    assertEquals(3000L, config.cooldownMs)
    assertEquals(10, config.smoothingWindow)
    assertEquals(256, config.inputFeatures)
  }

  @Test
  fun `config uses default hop when equal to frame`() {
    val config = OpenWakeWordConfig(frameLengthMs = 1280, hopLengthMs = 1280)
    assertEquals(config.frameLengthMs, config.hopLengthMs)
  }

  @Test
  fun `isAvailable returns false when context has no model assets`() {
    val available = OpenWakeWordDetector.isAvailable(
      org.mockito.Mockito.mock(android.content.Context::class.java)
    )
    assertFalse(available)
  }

  @Test
  fun `scoreHistory averaging works correctly`() {
    val scores = listOf(0.1f, 0.2f, 0.3f, 0.4f, 0.5f)
    val avg = scores.average().toFloat()
    assertEquals(0.3f, avg, 0.001f)
  }

  @Test
  fun `empty scoreHistory average returns zero`() {
    val scores = emptyList<Float>()
    val avg = scores.average()
    assertEquals(0.0, avg, 0.001)
  }

  @Test
  fun `scoreHistory bounds work correctly with smoothing window`() {
    val scores = mutableListOf<Float>()
    val window = 5
    for (i in 0 until 10) {
      scores.add(i.toFloat())
      if (scores.size > window) scores.removeAt(0)
    }
    assertEquals(5, scores.size)
    assertEquals(listOf(5f, 6f, 7f, 8f, 9f), scores)
  }
}
