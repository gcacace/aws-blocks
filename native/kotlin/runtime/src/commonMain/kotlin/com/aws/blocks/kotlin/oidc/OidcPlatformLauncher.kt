package com.aws.blocks.kotlin.oidc

internal interface OidcPlatformLauncher {
    suspend fun launch(authorizeUrl: String): String
}
