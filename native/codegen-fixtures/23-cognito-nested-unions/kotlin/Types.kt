package com.example.app

import kotlin.String
import kotlin.collections.List
import kotlin.collections.Map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class CodeDeliveryDetails(
  public val destination: String,
  public val deliveryMedium: DeliveryMedium,
  public val attributeName: String,
) {
  @Serializable
  public enum class DeliveryMedium {
    @SerialName("SMS")
    Sms,
    @SerialName("EMAIL")
    Email,
    @SerialName("PHONE_NUMBER")
    PhoneNumber,
  }
}

@Serializable
public data class CognitoUser(
  public val userSub: String,
  public val groups: List<String>,
  public val attributes: Map<String, String?>,
  public val userId: String,
  public val username: String,
)
