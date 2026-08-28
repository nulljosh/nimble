package com.nulljosh.nimble

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.runBlocking

actual fun runBlockingTest(block: suspend CoroutineScope.() -> Unit) = runBlocking { block() }
