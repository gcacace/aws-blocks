package com.aws.blocks.kotlin.oidc

import com.aws.blocks.kotlin.BlocksServer
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test

class OidcClientTest {

    private val authorizeParamsResponse = """{
        "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
        "clientId": "test-client-id",
        "scopes": ["openid", "email"],
        "kind": "oidc-builtin",
        "state": "server-signed-state-envelope",
        "nonce": "server-generated-nonce"
    }"""

    private fun createMockClient(
        exchangeResponse: String = """{"user":{"userId":"google:123","username":"alice"}}""",
        exchangeStatus: HttpStatusCode = HttpStatusCode.OK,
        signOutStatus: HttpStatusCode = HttpStatusCode.OK,
        authorizeParamsResponse: String = this.authorizeParamsResponse,
        authorizeParamsStatus: HttpStatusCode = HttpStatusCode.OK,
    ): HttpClient {
        return HttpClient(MockEngine) {
            install(HttpCookies)
            install(ContentNegotiation) { json() }
            engine {
                addHandler { request ->
                    when {
                        request.url.encodedPath.contains("/auth/authorize-params/") &&
                            request.method == HttpMethod.Post -> {
                            respond(
                                content = ByteReadChannel(authorizeParamsResponse),
                                status = authorizeParamsStatus,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                        request.url.encodedPath.endsWith("/auth/exchange") -> {
                            respond(
                                content = ByteReadChannel(exchangeResponse),
                                status = exchangeStatus,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                        request.url.encodedPath.endsWith("/auth/signout") -> {
                            respond(
                                content = ByteReadChannel("{}"),
                                status = signOutStatus,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                        else -> {
                            respond(
                                content = ByteReadChannel("{}"),
                                status = HttpStatusCode.OK,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                    }
                }
            }
        }
    }

    private val testDescriptor = """
        {
            "__blocks": "oidc/client",
            "providers": ["google"],
            "providerConfigs": {
                "google": {
                    "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
                    "clientId": "test-client-id",
                    "scopes": ["openid", "email"],
                    "kind": "oidc-builtin"
                }
            },
            "exchangePath": "/auth/exchange",
            "signOutPath": "/auth/signout",
            "signInBasePath": "/auth/signin",
            "authorizeParamsBasePath": "/auth/authorize-params",
            "callbackPath": "/auth/callback"
        }
    """.trimIndent()

    private val localServer = BlocksServer("local", "http://localhost:3001")

    @Test
    fun `fromJson parses providers`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.providers shouldBe listOf("google")
    }

    @Test
    fun `exchange transitions to signed in`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        val user = client.exchange(
            code = "auth-code-123",
            verifier = "test-verifier",
            state = "test-state",
            nonce = "test-nonce",
            provider = "google",
            callbackUrl = "http://localhost:3001/auth/callback",
        )

        user.userId shouldBe "google:123"
        user.username shouldBe "alice"
        client.authState.value shouldBe OidcAuthState.SignedIn(user)
    }

    @Test
    fun `signOut transitions to signed out`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        client.exchange(
            code = "auth-code-123",
            verifier = "test-verifier",
            state = "test-state",
            nonce = "test-nonce",
            provider = "google",
            callbackUrl = "http://localhost:3001/auth/callback",
        )

        client.signOut()
        client.authState.value shouldBe OidcAuthState.SignedOut
    }

    @Test
    fun `initial state is loading`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        client.authState.value shouldBe OidcAuthState.Loading
    }

    // --- Helper functions for signIn tests ---

    private fun parseQueryParams(url: String): Map<String, String> {
        val queryStart = url.indexOf('?')
        if (queryStart == -1) return emptyMap()
        return url.substring(queryStart + 1).split("&").associate {
            val (k, v) = it.split("=", limit = 2)
            k to java.net.URLDecoder.decode(v, "UTF-8")
        }
    }

    private fun parseHost(url: String): String {
        val withoutScheme = url.substringAfter("://")
        return withoutScheme.substringBefore("/").substringBefore("?")
    }

    // --- signIn tests ---

    @Test
    fun `signIn fetches authorize params and builds correct URL`() = runTest {
        var capturedUrl: String? = null
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                capturedUrl = authorizeUrl
                return "myapp://auth/callback?code=test-code&state=server-signed-state-envelope"
            }
        }

        val user = client.signIn("google")

        user.userId shouldBe "google:123"
        client.authState.value shouldBe OidcAuthState.SignedIn(user)

        val params = parseQueryParams(capturedUrl!!)
        parseHost(capturedUrl!!) shouldBe "accounts.google.com"
        params["response_type"] shouldBe "code"
        params["client_id"] shouldBe "test-client-id"
        params["redirect_uri"] shouldBe "http://localhost:3001/auth/callback"
        params["scope"] shouldBe "openid email"
        params["state"] shouldBe "server-signed-state-envelope"
        params["nonce"] shouldBe "server-generated-nonce"
        params["code_challenge_method"] shouldBe "S256"
        params["code_challenge"].shouldNotBeNull()
    }

    @Test
    fun `signIn throws when provider not configured`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String = ""
        }

        val exception = shouldThrow<OidcUnknownProviderException> {
            client.signIn("unknown-provider")
        }
        exception.provider shouldBe "unknown-provider"
    }

    @Test
    fun `signIn throws when platform launcher is unavailable`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        shouldThrow<Exception> {
            client.signIn("google")
        }
    }

    @Test
    fun `signIn throws on state mismatch`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                return "myapp://auth/callback?code=test-code&state=wrong-state"
            }
        }

        val exception = shouldThrow<OidcCallbackException> {
            client.signIn("google")
        }
        exception.message shouldBe "State mismatch in callback"
    }

    @Test
    fun `signIn throws on IdP error`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                return "myapp://auth/callback?error=access_denied&error_description=User+cancelled&state=server-signed-state-envelope"
            }
        }

        val exception = shouldThrow<OidcCallbackException> {
            client.signIn("google")
        }
        exception.message shouldBe "IdP error: access_denied — User cancelled"
    }

    @Test
    fun `signIn throws when authorize-params request fails`() = runTest {
        val httpClient = createMockClient(
            authorizeParamsStatus = HttpStatusCode.BadRequest,
            authorizeParamsResponse = """{"error":"invalid_relay","reason":"unknown-origin"}""",
        )
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String = ""
        }

        shouldThrow<OidcCallbackException> {
            client.signIn("google")
        }
    }

    @Test
    fun `signIn throws OidcCancelledException when launcher cancels`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                throw OidcCancelledException()
            }
        }

        shouldThrow<OidcCancelledException> {
            client.signIn("google")
        }
    }

    @Test
    fun `signIn throws when callback is missing code parameter`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                return "myapp://auth/callback?state=server-signed-state-envelope"
            }
        }

        val exception = shouldThrow<OidcCallbackException> {
            client.signIn("google")
        }
        exception.message shouldBe "Callback URI missing 'code' parameter"
    }

    @Test
    fun `signIn throws when callback is missing state parameter`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                return "myapp://auth/callback?code=test-code"
            }
        }

        val exception = shouldThrow<OidcCallbackException> {
            client.signIn("google")
        }
        exception.message shouldBe "Callback URI missing 'state' parameter"
    }

    @Test
    fun `exchange throws on HTTP error`() = runTest {
        val httpClient = createMockClient(
            exchangeStatus = HttpStatusCode.InternalServerError,
        )
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        val exception = shouldThrow<OidcExchangeException> {
            client.exchange(
                code = "auth-code",
                verifier = "verifier",
                state = "state",
                nonce = "nonce",
                provider = "google",
                callbackUrl = "http://localhost:3001/auth/callback",
            )
        }
        exception.message shouldBe "Exchange failed: HTTP 500"
    }

    @Test
    fun `exchange throws when response is missing user field`() = runTest {
        val httpClient = createMockClient(
            exchangeResponse = """{"session":"abc"}""",
        )
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        val exception = shouldThrow<OidcExchangeException> {
            client.exchange(
                code = "auth-code",
                verifier = "verifier",
                state = "state",
                nonce = "nonce",
                provider = "google",
                callbackUrl = "http://localhost:3001/auth/callback",
            )
        }
        exception.message shouldBe "Exchange response missing 'user' field"
    }

    @Test
    fun `signIn sends correct body to authorize-params endpoint`() = runTest {
        var capturedBody: String? = null
        val httpClient = HttpClient(MockEngine) {
            install(HttpCookies)
            install(ContentNegotiation) { json() }
            engine {
                addHandler { request ->
                    when {
                        request.url.encodedPath.contains("/auth/authorize-params/") -> {
                            capturedBody = (request.body as io.ktor.http.content.TextContent).text
                            respond(
                                content = ByteReadChannel(authorizeParamsResponse),
                                status = HttpStatusCode.OK,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                        request.url.encodedPath.endsWith("/auth/exchange") -> {
                            respond(
                                content = ByteReadChannel("""{"user":{"userId":"google:123","username":"alice"}}"""),
                                status = HttpStatusCode.OK,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                        else -> {
                            respond(
                                content = ByteReadChannel("{}"),
                                status = HttpStatusCode.OK,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )
                        }
                    }
                }
            }
        }

        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                return "myapp://auth/callback?code=test-code&state=server-signed-state-envelope"
            }
        }

        client.signIn("google")

        val body = Json.parseToJsonElement(capturedBody!!).jsonObject
        body["relayTo"]?.jsonPrimitive?.content shouldBe "myapp://auth/callback"
        body["csrf"]?.jsonPrimitive?.content.shouldNotBeNull()
    }

    @Test
    fun `signOut transitions to signed out even on server error`() = runTest {
        val httpClient = createMockClient(signOutStatus = HttpStatusCode.InternalServerError)
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")

        client.exchange(
            code = "auth-code",
            verifier = "verifier",
            state = "state",
            nonce = "nonce",
            provider = "google",
            callbackUrl = "http://localhost:3001/auth/callback",
        )

        client.signOut()
        client.authState.value shouldBe OidcAuthState.SignedOut
    }

    @Test
    fun `signIn does not change auth state on failure`() = runTest {
        val httpClient = createMockClient()
        val element = Json.parseToJsonElement(testDescriptor)
        val client = OidcClient.fromJson(element, httpClient, localServer, "myapp://auth/callback")
        client.platformLauncher = object : OidcPlatformLauncher {
            override suspend fun launch(authorizeUrl: String): String {
                throw OidcCancelledException()
            }
        }

        client.authState.value shouldBe OidcAuthState.Loading

        runCatching { client.signIn("google") }

        client.authState.value shouldBe OidcAuthState.Loading
    }
}
