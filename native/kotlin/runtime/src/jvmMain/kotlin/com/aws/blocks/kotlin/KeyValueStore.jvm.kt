package com.aws.blocks.kotlin

import java.io.File
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

internal actual fun encryptedKeyValueStore(name: String): KeyValueStore =
    EncryptedFileKeyValueStore(name)

private class EncryptedFileKeyValueStore(name: String) : KeyValueStore {

    private companion object {
        const val AES_KEY_SIZE = 32
        const val GCM_NONCE_SIZE = 12
        const val GCM_TAG_BITS = 128
    }

    private val storageDir: File by lazy {
        File(System.getProperty("user.home"), ".blocks/$name").also { it.mkdirs() }
    }

    private val secretKey: SecretKey by lazy {
        val keyFile = File(storageDir, ".key")
        if (keyFile.exists()) {
            val bytes = Base64.getDecoder().decode(keyFile.readText())
            SecretKeySpec(bytes, "AES")
        } else {
            val bytes = ByteArray(AES_KEY_SIZE).also { SecureRandom().nextBytes(it) }
            keyFile.writeText(Base64.getEncoder().encodeToString(bytes))
            keyFile.setReadable(false, false)
            keyFile.setReadable(true, true)
            SecretKeySpec(bytes, "AES")
        }
    }

    override fun put(key: String, value: String) {
        val file = File(storageDir, Base64.getUrlEncoder().encodeToString(key.toByteArray()))
        file.writeText(encrypt(value))
    }

    override fun get(key: String): String? {
        val file = File(storageDir, Base64.getUrlEncoder().encodeToString(key.toByteArray()))
        if (!file.exists()) return null
        return decrypt(file.readText())
    }

    override fun remove(key: String) {
        val file = File(storageDir, Base64.getUrlEncoder().encodeToString(key.toByteArray()))
        file.delete()
    }

    override fun getAll(): Map<String, String> {
        if (!storageDir.exists()) return emptyMap()
        return storageDir.listFiles().orEmpty()
            .filter { it.isFile && !it.name.startsWith(".") }
            .mapNotNull { file ->
                val key = String(Base64.getUrlDecoder().decode(file.name))
                val value = decrypt(file.readText()) ?: return@mapNotNull null
                key to value
            }.toMap()
    }

    private fun encrypt(plaintext: String): String {
        val nonce = ByteArray(GCM_NONCE_SIZE).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_BITS, nonce))
        val ciphertext = cipher.doFinal(plaintext.toByteArray())
        val combined = nonce + ciphertext
        return Base64.getEncoder().encodeToString(combined)
    }

    private fun decrypt(encoded: String): String? {
        return try {
            val combined = Base64.getDecoder().decode(encoded)
            val nonce = combined.copyOfRange(0, GCM_NONCE_SIZE)
            val ciphertext = combined.copyOfRange(GCM_NONCE_SIZE, combined.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_BITS, nonce))
            String(cipher.doFinal(ciphertext))
        } catch (_: Exception) {
            null
        }
    }
}
