package com.krishna.assistant

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.security.KeyStore.SecretKeyEntry
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object KeyStoreHelper {
  private const val KEY_ALIAS = "krishna_master_key_kek"
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"

  @JvmStatic
  fun hasKey(): Boolean {
    try {
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
      ks.load(null)
      return ks.containsAlias(KEY_ALIAS)
    } catch (_: Exception) {
      return false
    }
  }

  @JvmStatic
  fun generateKey(): Boolean {
    try {
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
      ks.load(null)
      if (ks.containsAlias(KEY_ALIAS)) return true

      return tryGenerate(true) || tryGenerate(false)
    } catch (_: Exception) {
      return false
    }
  }

  private fun tryGenerate(strongBox: Boolean): Boolean {
    return try {
      val generator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE
      )
      val spec = KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setIsStrongBoxBacked(strongBox)
        .build()
      generator.init(spec)
      generator.generateKey()
      true
    } catch (_: android.security.keystore.StrongBoxUnavailableException) {
      false
    }
  }

  @JvmStatic
  fun encrypt(plaintext: ByteArray): ByteArray {
    val secretKey = loadKey()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey)
    val iv = cipher.iv
    val ct = cipher.doFinal(plaintext)
    // Format: [12-byte IV][ciphertext + GCM tag]
    val out = ByteArray(iv.size + ct.size)
    System.arraycopy(iv, 0, out, 0, iv.size)
    System.arraycopy(ct, 0, out, iv.size, ct.size)
    return out
  }

  @JvmStatic
  fun decrypt(data: ByteArray): ByteArray {
    if (data.size < 28) throw IllegalArgumentException("Ciphertext too short")
    val secretKey = loadKey()
    val iv = data.copyOfRange(0, 12)
    val ct = data.copyOfRange(12, data.size)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
    return cipher.doFinal(ct)
  }

  private fun loadKey(): SecretKey {
    val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
    ks.load(null)
    if (!ks.containsAlias(KEY_ALIAS)) {
      throw IllegalStateException("Key not found in KeyStore — first-run seal never completed")
    }
    return (ks.getEntry(KEY_ALIAS, null) as SecretKeyEntry).secretKey
  }
}
