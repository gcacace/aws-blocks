package com.aws.blocks.kotlin.exceptions

open class BlocksException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
