package com.aws.blocks.kotlin

import android.util.Log
import io.ktor.client.plugins.logging.Logger

internal actual fun platformLogger(): Logger = object : Logger {
    override fun log(message: String) {
        Log.d("BlocksHttp", message)
    }
}
