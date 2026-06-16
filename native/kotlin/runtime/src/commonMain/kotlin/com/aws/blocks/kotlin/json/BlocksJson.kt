package com.aws.blocks.kotlin.json

import kotlinx.serialization.json.Json

val BlocksJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = false
}
