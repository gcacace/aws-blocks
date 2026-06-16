package com.example.app

import kotlin.Boolean
import kotlin.Int
import kotlin.String
import kotlinx.serialization.Serializable

@Serializable
public data class Todo(
  public val id: String,
  public val title: String,
  public val done: Boolean,
  public val priority: Int,
)
