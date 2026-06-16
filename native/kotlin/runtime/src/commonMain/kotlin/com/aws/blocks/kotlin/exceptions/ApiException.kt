package com.aws.blocks.kotlin.exceptions

import kotlin.contracts.ExperimentalContracts
import kotlin.contracts.contract

class ApiException(
    message: String,
    val status: Int,
    val name: String? = null,
    cause: Throwable? = null
) : BlocksException(message, cause)

@OptIn(ExperimentalContracts::class)
fun Throwable.isBlocksError(name: String): Boolean {
    contract {
        returns(true) implies (this@isBlocksError is ApiException)
    }
    return this is ApiException && this.name == name
}
