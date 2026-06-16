package com.aws.blocks.kotlin

import io.ktor.client.plugins.logging.Logger
import platform.Foundation.NSLog

internal actual fun platformLogger(): Logger = object : Logger {
    override fun log(message: String) {
        NSLog("BlocksHttp: %@", message)
    }
}
