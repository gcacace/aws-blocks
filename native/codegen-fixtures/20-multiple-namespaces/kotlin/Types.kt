package com.example.app

import kotlin.String
import kotlinx.serialization.Serializable

@Serializable
public data class User(
  public val id: String,
  public val name: String,
  public val email: String,
)
