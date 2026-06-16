package com.aws.blocks.kotlin.oidc

import com.aws.blocks.kotlin.exceptions.BlocksException

sealed class OidcException(message: String, cause: Throwable? = null) : BlocksException(message, cause)

class OidcUnknownProviderException(val provider: String) :
    OidcException("Provider not configured: $provider")

class OidcExchangeException(message: String, cause: Throwable? = null) :
    OidcException(message, cause)

class OidcCallbackException(message: String) :
    OidcException(message)

class OidcCancelledException :
    OidcException("Sign-in cancelled")
