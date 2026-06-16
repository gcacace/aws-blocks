package com.example.app

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class MfaChallenge(
  public val action: Action,
  public val code: String,
  public val session: String,
) {
  @Serializable
  public enum class Action {
    @SerialName("mfa")
    Mfa,
  }
}
