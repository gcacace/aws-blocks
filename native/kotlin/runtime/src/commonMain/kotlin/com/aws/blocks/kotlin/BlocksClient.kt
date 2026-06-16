package com.aws.blocks.kotlin

import com.aws.blocks.kotlin.exceptions.ApiException
import com.aws.blocks.kotlin.exceptions.BlocksException
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Url
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/** JSON-RPC client that executes requests against an AWS Blocks backend endpoint. */
class BlocksClient(
    internal val server: BlocksServer
) {
    internal val httpClient: HttpClient = defaultHttpClient()

    suspend fun execute(request: BlocksRequest): JsonElement {
        val json = Json.encodeToString(request)

        val response = httpClient.post(server.url) {
            contentType(ContentType.Application.Json)
            setBody(json)
        }

        val responseBody = response.bodyAsText()

        val responseJson = try {
            Json.parseToJsonElement(responseBody) as? JsonObject
        } catch (_: Exception) {
            null
        }

        if (!response.status.isSuccess()) {
            val message = responseJson?.get("error")?.jsonPrimitive?.content ?: "HTTP Error: ${response.status.value}"
            val name = responseJson?.get("name")?.jsonPrimitive?.content
            throw ApiException(message, response.status.value, name)
        }

        val resultElement = responseJson?.get("result")
            ?: throw BlocksException("Missing result field in JSON-RPC response")

        return resultElement
    }
}
