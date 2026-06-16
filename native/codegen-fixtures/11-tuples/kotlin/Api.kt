package com.example.app

import com.aws.blocks.kotlin.BlocksClient
import com.aws.blocks.kotlin.BlocksRequest
import com.aws.blocks.kotlin.BlocksServer
import com.aws.blocks.kotlin.json.BlocksJson
import kotlin.Double
import kotlin.Int
import kotlin.String
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.decodeFromJsonElement

public class Api(
  private val server: BlocksServer = Servers.local,
) {
  private val client: BlocksClient = BlocksClient(server)

  public suspend fun getCoords(): GetCoords.Result {
    val request = BlocksRequest(method = "api.getCoords", params = emptyList(), id = BlocksRequest.nextId())
    val result = client.execute(request)
    return BlocksJson.decodeFromJsonElement(result)
  }

  public suspend fun getPair(): GetPair.Result {
    val request = BlocksRequest(method = "api.getPair", params = emptyList(), id = BlocksRequest.nextId())
    val result = client.execute(request)
    return BlocksJson.decodeFromJsonElement(result)
  }

  public object GetCoords {
    @Serializable
    public data class Result(
      public val item0: Double,
      public val item1: Double,
      public val item2: String,
    )
  }

  public object GetPair {
    @Serializable
    public data class Result(
      public val item0: String,
      public val item1: Int,
    )
  }
}
