package com.aws.blocks.kotlin.exceptions

open class TransferableException(message: String, cause: Throwable? = null) :
    BlocksException(message, cause)

class UnknownTransferableTypeException(val blocksType: String) :
    TransferableException("No hydrator registered for transferable type: $blocksType")

class InvalidDescriptorException(val blocksType: String, val missingField: String) :
    TransferableException("Descriptor '$blocksType' is missing required field: $missingField")

class TransferableIOException(message: String, cause: Throwable? = null) :
    TransferableException(message, cause)
