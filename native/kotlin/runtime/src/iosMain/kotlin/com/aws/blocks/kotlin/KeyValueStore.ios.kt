package com.aws.blocks.kotlin

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.value
import platform.CoreFoundation.CFDictionaryRef
import platform.CoreFoundation.CFTypeRefVar
import platform.Foundation.CFBridgingRelease
import platform.Foundation.CFBridgingRetain
import platform.Foundation.NSData
import platform.Foundation.NSString
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.create
import platform.Foundation.dataUsingEncoding
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitAll
import platform.Security.kSecReturnAttributes
import platform.Security.kSecReturnData
import platform.Security.kSecValueData
import platform.darwin.OSStatus

internal actual fun encryptedKeyValueStore(name: String): KeyValueStore = KeychainKeyValueStore(name)

@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
private class KeychainKeyValueStore(private val service: String) : KeyValueStore {

    override fun put(key: String, value: String) {
        remove(key)
        val data = (value as NSString).dataUsingEncoding(NSUTF8StringEncoding) ?: return
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service,
            kSecAttrAccount to key,
            kSecValueData to data
        )
        @Suppress("UNCHECKED_CAST")
        SecItemAdd(CFBridgingRetain(query) as CFDictionaryRef, null)
    }

    override fun get(key: String): String? {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service,
            kSecAttrAccount to key,
            kSecReturnData to true
        )
        memScoped {
            val result = alloc<CFTypeRefVar>()
            @Suppress("UNCHECKED_CAST")
            val status: OSStatus = SecItemCopyMatching(
                CFBridgingRetain(query) as CFDictionaryRef,
                result.ptr
            )
            if (status != errSecSuccess) return null
            val data = CFBridgingRelease(result.value) as? NSData ?: return null
            return NSString.create(data = data, encoding = NSUTF8StringEncoding) as? String
        }
    }

    override fun remove(key: String) {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service,
            kSecAttrAccount to key
        )
        @Suppress("UNCHECKED_CAST")
        SecItemDelete(CFBridgingRetain(query) as CFDictionaryRef)
    }

    override fun getAll(): Map<String, String> {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service,
            kSecReturnAttributes to true,
            kSecReturnData to true,
            kSecMatchLimit to kSecMatchLimitAll
        )
        memScoped {
            val result = alloc<CFTypeRefVar>()
            @Suppress("UNCHECKED_CAST")
            val status: OSStatus = SecItemCopyMatching(
                CFBridgingRetain(query) as CFDictionaryRef,
                result.ptr
            )
            if (status != errSecSuccess) return emptyMap()

            @Suppress("UNCHECKED_CAST")
            val items = CFBridgingRelease(result.value) as? List<Map<Any?, Any?>>
                ?: return emptyMap()
            return items.mapNotNull { item ->
                val account = item[kSecAttrAccount] as? String ?: return@mapNotNull null
                val data = item[kSecValueData] as? NSData ?: return@mapNotNull null
                val value = NSString.create(data = data, encoding = NSUTF8StringEncoding) as? String
                    ?: return@mapNotNull null
                account to value
            }.toMap()
        }
    }
}
