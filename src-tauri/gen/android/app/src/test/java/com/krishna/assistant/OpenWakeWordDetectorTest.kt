package com.krishna.assistant

import org.junit.Assert.*
import org.junit.Test

class OpenWakeWordDetectorTest {

  @Test
  fun `config default values are correct`() {
    val config = OpenWakeWordConfig()
    assertEquals(16000, config.sampleRate)
    assertEquals(1280, config.frameSamples)
    assertEquals(8000, config.contextSamples)
    assertEquals(0.5f, config.scoreThreshold, 0.001f)
    assertEquals(2000L, config.cooldownMs)
    assertEquals(5, config.smoothingWindow)
  }

  @Test
  fun `config custom values are preserved`() {
    val config = OpenWakeWordConfig(
      modelPath = "custom/path/model.tflite",
      sampleRate = 8000,
      frameSamples = 640,
      scoreThreshold = 0.75f,
      cooldownMs = 3000L,
      smoothingWindow = 10,
    )
    assertEquals("custom/path/model.tflite", config.modelPath)
    assertEquals(8000, config.sampleRate)
    assertEquals(640, config.frameSamples)
    assertEquals(0.75f, config.scoreThreshold, 0.001f)
    assertEquals(3000L, config.cooldownMs)
    assertEquals(10, config.smoothingWindow)
  }

  @Test
  fun `DetectorMode enum values`() {
    assertEquals("SHADOW", DetectorMode.SHADOW.name)
    assertEquals("ACTIVE", DetectorMode.ACTIVE.name)
  }

  @Test
  fun `ModelManifest validate passes for matching tensors`() {
    val manifest = ModelManifest(
      inputShape = listOf(1, 8000),
      outputShape = listOf(1, 1),
    )
    val result = manifest.validate(intArrayOf(1, 8000), intArrayOf(1, 1))
    assertNull(result)
  }

  @Test
  fun `ModelManifest validate rejects input shape mismatch`() {
    val manifest = ModelManifest(inputShape = listOf(1, 8000), outputShape = listOf(1, 1))
    val result = manifest.validate(intArrayOf(1, 16000), intArrayOf(1, 1))
    assertNotNull(result)
    assertTrue(result!!.contains("Input dim 1"))
  }

  @Test
  fun `ModelManifest validate rejects output shape mismatch`() {
    val manifest = ModelManifest(inputShape = listOf(1, 8000), outputShape = listOf(1, 1))
    val result = manifest.validate(intArrayOf(1, 8000), intArrayOf(1, 3))
    assertNotNull(result)
    assertTrue(result!!.contains("Output dim 1"))
  }

  @Test
  fun `ModelManifest validate rejects rank mismatch`() {
    val manifest = ModelManifest(inputShape = listOf(1, 8000), outputShape = listOf(1, 1))
    val result = manifest.validate(intArrayOf(1, 8000, 1), intArrayOf(1, 1))
    assertNotNull(result)
    assertTrue(result!!.contains("Input rank mismatch"))
  }

  @Test
  fun `ModelManifest default values`() {
    val manifest = ModelManifest()
    assertEquals("", manifest.modelVersion)
    assertEquals(16000, manifest.sampleRate)
    assertEquals(1280, manifest.frameLength)
    assertEquals(8000, manifest.inputSamples)
    assertEquals(listOf(1, 8000), manifest.inputShape)
    assertEquals("float32", manifest.inputDtype)
    assertEquals(listOf(1, 1), manifest.outputShape)
    assertEquals("float32", manifest.outputDtype)
    assertEquals(listOf("wake_probability"), manifest.outputLabels)
  }

  @Test
  fun `scoreHistory averaging works`() {
    val scores = listOf(0.1f, 0.2f, 0.3f, 0.4f, 0.5f)
    val avg = scores.average().toFloat()
    assertEquals(0.3f, avg, 0.001f)
  }

  @Test
  fun `empty scoreHistory average returns NaN`() {
    val avg = emptyList<Float>().average()
    assertTrue(avg.isNaN())
  }

  @Test
  fun `scoreHistory bounds check with smoothing window`() {
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
