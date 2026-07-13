package com.krishna.assistant

import org.junit.Assert.*
import org.junit.Test

class WakeWordProfileStoreTest {

  private fun makeProfile(
    evaluationStatus: String = "ready_for_approval",
    modelVersion: String = "krishna-waveform-v1.0.0",
    recall: Float = 0.85f,
    falseWakeRate: Float = 0.05f,
    positiveCount: Int = 150,
    negativeCount: Int = 300,
    environmentCount: Int = 5,
    startedAt: Long = System.currentTimeMillis() - 72L * 3_600_000L,
    recordingRetentionEnabled: Boolean = true,
    evalModelVersion: String? = null,
  ): WakeWordProfile {
    return WakeWordProfile(
      evaluationStatus = evaluationStatus,
      modelVersion = modelVersion,
      positiveCount = positiveCount,
      negativeCount = negativeCount,
      environmentCount = environmentCount,
      startedAt = startedAt,
      recordingRetentionEnabled = recordingRetentionEnabled,
      evaluationResult = EvaluationResult(
        recall = recall,
        falseWakeRate = falseWakeRate,
        modelVersion = evalModelVersion ?: modelVersion,
      ),
    )
  }

  @Test
  fun `valid profile passes all gates`() {
    val profile = makeProfile()
    assertNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `wrong evaluation status is rejected`() {
    val profile = makeProfile(evaluationStatus = "collecting")
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("evaluation status"))
  }

  @Test
  fun `collecting status is rejected`() {
    val profile = makeProfile(evaluationStatus = "collecting")
    assertNotNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `failed status is rejected`() {
    val profile = makeProfile(evaluationStatus = "failed")
    assertNotNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `approved status is rejected (must not re-approve)`() {
    val profile = makeProfile(evaluationStatus = "approved")
    assertNotNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `recall below 0-80 is rejected`() {
    val profile = makeProfile(recall = 0.62f)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("recall"))
  }

  @Test
  fun `recall exactly 0-80 is accepted`() {
    val profile = makeProfile(recall = 0.80f)
    assertNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `false-wake rate above 0-10 is rejected`() {
    val profile = makeProfile(falseWakeRate = 0.30f)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("false-wake rate"))
  }

  @Test
  fun `false-wake rate exactly 0-10 is accepted`() {
    val profile = makeProfile(falseWakeRate = 0.10f)
    assertNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `model version mismatch is rejected`() {
    val profile = makeProfile(evalModelVersion = "old-model-v2.0.0")
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("model"))
  }

  @Test
  fun `empty model version is rejected`() {
    val profile = makeProfile(modelVersion = "")
    assertNotNull(WakeWordProfileStore.validateActivationApproval(profile))
  }

  @Test
  fun `recording retention disabled is rejected`() {
    val profile = makeProfile(recordingRetentionEnabled = false)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("retention"))
  }

  @Test
  fun `insufficient positive clips is rejected`() {
    val profile = makeProfile(positiveCount = 50)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("positive"))
  }

  @Test
  fun `insufficient negative clips is rejected`() {
    val profile = makeProfile(negativeCount = 50)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("negative"))
  }

  @Test
  fun `insufficient environments is rejected`() {
    val profile = makeProfile(environmentCount = 1)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("environments"))
  }

  @Test
  fun `insufficient hours elapsed is rejected`() {
    val profile = makeProfile(startedAt = System.currentTimeMillis() - 1L)
    val error = WakeWordProfileStore.validateActivationApproval(profile)
    assertNotNull(error)
    assertTrue(error!!.contains("hours"))
  }

  @Test
  fun `default profile is collecting and fails all gates`() {
    val profile = WakeWordProfile()
    assertEquals("collecting", profile.evaluationStatus)
    assertNotNull(WakeWordProfileStore.validateActivationApproval(profile))
  }
}
