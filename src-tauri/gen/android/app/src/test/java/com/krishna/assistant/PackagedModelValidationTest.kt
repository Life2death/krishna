package com.krishna.assistant

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.MessageDigest

/**
 * Validates the packaged model.tflite against its manifest.json contract.
 *
 * Reads files from the known app module path so the test works without
 * classpath resource loading (which is unreliable for Android Gradle
 * unit tests with build variants).
 */
class PackagedModelValidationTest {

  /**
   * Expected contract — must match what training/openwakeword/export/
   * produces. Update these when retraining.
   */
  companion object {
    // Generated 2026-07-13 by training/openwakeword/train_model.py
    const val EXPECTED_SHA256 = "f21eb5d91811218de6f9e60e1453b44e79ba31bf9d9334cb19d6e796401ed8da"
    const val EXPECTED_MODEL_VERSION = "krishna-waveform-v1.0.0"
    const val EXPECTED_SAMPLE_RATE = 16000
    val EXPECTED_INPUT_SHAPE = intArrayOf(1, 8000)
    val EXPECTED_OUTPUT_SHAPE = intArrayOf(1, 1)
    const val EXPECTED_INPUT_DTYPE = "float32"
    const val EXPECTED_OUTPUT_DTYPE = "float32"

    private val ASSETS_BASE = File(
      "src/main/assets/wake-word/openwakeword"
    )
  }

  @Test
  fun `model file exists in Android assets`() {
    val modelFile = File(ASSETS_BASE, "model.tflite")
    assertTrue("model.tflite must exist at ${modelFile.absolutePath}", modelFile.exists())
    assertTrue("model.tflite must not be empty", modelFile.length() > 0)
  }

  @Test
  fun `manifest file exists in Android assets`() {
    val manifestFile = File(ASSETS_BASE, "manifest.json")
    assertTrue("manifest.json must exist at ${manifestFile.absolutePath}", manifestFile.exists())
  }

  @Test
  fun `model SHA-256 matches expected value`() {
    val modelFile = File(ASSETS_BASE, "model.tflite")
    val modelBytes = modelFile.readBytes()
    val digest = MessageDigest.getInstance("SHA-256")
    val actualSha = digest.digest(modelBytes).joinToString("") { "%02x".format(it) }
    assertEquals("model.tflite SHA-256 mismatch", EXPECTED_SHA256, actualSha)
  }

  @Test
  fun `ModelManifest validation passes against expected contract`() {
    val manifest = ModelManifest(
      modelVersion = EXPECTED_MODEL_VERSION,
      sha256 = EXPECTED_SHA256,
      sampleRate = EXPECTED_SAMPLE_RATE,
      inputSamples = EXPECTED_INPUT_SHAPE[1],
      inputShape = EXPECTED_INPUT_SHAPE.toList(),
      inputDtype = EXPECTED_INPUT_DTYPE,
      outputShape = EXPECTED_OUTPUT_SHAPE.toList(),
      outputDtype = EXPECTED_OUTPUT_DTYPE,
      outputLabels = listOf("wake_probability"),
    )
    val error = manifest.validate(EXPECTED_INPUT_SHAPE, EXPECTED_OUTPUT_SHAPE)
    assertNull("ModelManifest validation should pass: $error", error)
  }

  @Test
  fun `ModelManifest catches input shape mismatch`() {
    val manifest = ModelManifest(
      inputShape = EXPECTED_INPUT_SHAPE.toList(),
      outputShape = EXPECTED_OUTPUT_SHAPE.toList(),
    )
    val error = manifest.validate(intArrayOf(1, 16000), EXPECTED_OUTPUT_SHAPE)
    assertNotNull("Should reject wrong input dim 1", error)
  }

  @Test
  fun `ModelManifest catches output shape mismatch`() {
    val manifest = ModelManifest(
      inputShape = EXPECTED_INPUT_SHAPE.toList(),
      outputShape = EXPECTED_OUTPUT_SHAPE.toList(),
    )
    val error = manifest.validate(EXPECTED_INPUT_SHAPE, intArrayOf(1, 3))
    assertNotNull("Should reject wrong output dim 1", error)
  }

  @Test
  fun `manifest file content matches expected SHA-256`() {
    // Verify the manifest.json in Android assets has the same SHA-256 as the
    // model file, guarding against accidentally replacing the model without
    // updating the manifest.
    val modelFile = File(ASSETS_BASE, "model.tflite")
    val manifestFile = File(ASSETS_BASE, "manifest.json")
    val modelBytes = modelFile.readBytes()
    val manifestContent = manifestFile.readText()
    val afterKey = manifestContent.split("\"sha256\"").drop(1).firstOrNull()
    val manifestSha = afterKey?.split("\"")?.drop(1)?.firstOrNull()?.trim()
    val digest = MessageDigest.getInstance("SHA-256")
    val actualSha = digest.digest(modelBytes).joinToString("") { "%02x".format(it) }
    assertEquals("manifest.json sha256 must match model SHA-256", actualSha, manifestSha)
  }
}
