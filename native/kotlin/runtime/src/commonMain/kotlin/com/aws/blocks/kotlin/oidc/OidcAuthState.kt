package com.aws.blocks.kotlin.oidc

sealed interface OidcAuthState {
    data object Loading : OidcAuthState
    data object SignedOut : OidcAuthState
    data class SignedIn(val user: OidcUser) : OidcAuthState
}
