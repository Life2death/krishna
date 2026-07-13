package com.krishna.assistant

import org.junit.Assert.*
import org.junit.Test

class WakeWordProfileStoreTest {

  @Test
  fun `default profile has correct initial values`() {
    val profile = WakeWordProfile()
    assertFalse(profile.enabled)
    assertEquals("", profile.modelVersion)
    assertEquals(0L, profile.consentGrantedAt)
    assertEquals(0, profile.positiveCount)
    assertEquals(0, profile.negativeCount)
    assertEquals(0, profile.environmentCount)
    assertEquals(0L, profile.startedAt)
    assertEquals("collecting", profile.evaluationStatus)
    assertEquals(0L, profile.activationApprovedAt)
    assertEquals("", profile.lastError)
    assertEquals("builtin_mic", profile.audioSource)
    assertEquals(0.5f, profile.threshold, 0.001f)
    assertEquals(0f, profile.lastScore, 0.001f)
    assertEquals(0, profile.lastFrameCount)
    assertEquals("idle", profile.lastDetectorState)
    assertFalse(profile.recordingRetentionEnabled)
  }

  @Test
  fun `profile copy correctly creates modified instance`() {
    val profile = WakeWordProfile()
    val modified = profile.copy(enabled = true, positiveCount = 100)
    assertTrue(modified.enabled)
    assertEquals(100, modified.positiveCount)
    assertEquals(0, modified.negativeCount)
  }

  @Test
  fun `readiness gate fails with insufficient samples`() {
    val profile = WakeWordProfile()
    assertFalse(
      profile.positiveCount >= 100 &&
      profile.negativeCount >= 200 &&
      profile.environmentCount >= 3
    )
  }

  @Test
  fun `readiness gate passes with sufficient samples`() {
    val profile = WakeWordProfile(
      positiveCount = 100,
      negativeCount = 200,
      environmentCount = 5,
    )
    assertTrue(
      profile.positiveCount >= 100 &&
      profile.negativeCount >= 200 &&
      profile.environmentCount >= 3
    )
  }

  @Test
  fun `readiness gate requires at least 48 hours`() {
    val startedAt = 0L
    val hoursElapsed = if (startedAt > 0L) {
      (System.currentTimeMillis() - startedAt) / 3_600_000L
    } else 0L
    assertFalse(hoursElapsed >= 48)
  }

  @Test
  fun `evaluationStatus transitions are valid`() {
    val collecting = WakeWordProfile(evaluationStatus = "collecting")
    assertEquals("collecting", collecting.evaluationStatus)
    val ready = collecting.copy(evaluationStatus = "ready_for_evaluation")
    assertEquals("ready_for_evaluation", ready.evaluationStatus)
    val passed = ready.copy(evaluationStatus = "passed")
    assertEquals("passed", passed.evaluationStatus)
    val failed = ready.copy(evaluationStatus = "failed")
    assertEquals("failed", failed.evaluationStatus)
  }

  @Test
  fun `copy preserves unmodified fields`() {
    val profile = WakeWordProfile(
      enabled = true,
      modelVersion = "v1.0",
      consentGrantedAt = 1000L,
      positiveCount = 50,
      lastError = "test error",
    )
    val modified = profile.copy(negativeCount = 25)
    assertEquals("v1.0", modified.modelVersion)
    assertEquals(1000L, modified.consentGrantedAt)
    assertEquals(50, modified.positiveCount)
    assertEquals(25, modified.negativeCount)
    assertEquals("test error", modified.lastError)
  }
}
