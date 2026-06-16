package com.aws.blocks.kotlin

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import io.ktor.http.Cookie
import io.ktor.http.Url
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

class PersistentCookiesStorageTest {

    private class InMemoryKeyValueStore : KeyValueStore {
        private val data = mutableMapOf<String, String>()
        override fun put(key: String, value: String) { data[key] = value }
        override fun get(key: String): String? = data[key]
        override fun remove(key: String) { data.remove(key) }
        override fun getAll(): Map<String, String> = data.toMap()
    }

    private val store = InMemoryKeyValueStore()
    private val cookiesStorage = PersistentCookiesStorage(store)

    @Test
    fun addAndRetrieveCookie() = runTest {
        val url = Url("https://example.com/path")
        val cookie = Cookie(name = "session", value = "abc123")

        cookiesStorage.addCookie(url, cookie)

        val result = cookiesStorage.get(url)
        result shouldHaveSize 1
        result[0].name shouldBe "session"
        result[0].value shouldBe "abc123"
    }

    @Test
    fun filtersbyHost() = runTest {
        val url1 = Url("https://example.com/path")
        val url2 = Url("https://other.com/path")

        cookiesStorage.addCookie(url1, Cookie(name = "a", value = "1"))
        cookiesStorage.addCookie(url2, Cookie(name = "b", value = "2"))

        val result = cookiesStorage.get(url1)
        result shouldHaveSize 1
        result[0].name shouldBe "a"
    }

    @Test
    fun overwritesCookieWithSameName() = runTest {
        val url = Url("https://example.com/path")

        cookiesStorage.addCookie(url, Cookie(name = "session", value = "old"))
        cookiesStorage.addCookie(url, Cookie(name = "session", value = "new"))

        val result = cookiesStorage.get(url)
        result shouldHaveSize 1
        result[0].value shouldBe "new"
    }

    @Test
    fun returnsEmptyForUnknownHost() = runTest {
        val url = Url("https://unknown.com/path")
        cookiesStorage.get(url).shouldBeEmpty()
    }
}
