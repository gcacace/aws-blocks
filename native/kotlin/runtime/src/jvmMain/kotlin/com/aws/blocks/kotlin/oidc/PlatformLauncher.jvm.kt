package com.aws.blocks.kotlin.oidc

internal actual fun createPlatformLauncher(): OidcPlatformLauncher = object : OidcPlatformLauncher {
    override suspend fun launch(authorizeUrl: String): String {
        throw UnsupportedOperationException("OIDC sign-in is not supported on this platform")
    }
}
