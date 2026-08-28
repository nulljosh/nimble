package com.nulljosh.nimble

import kotlinx.coroutines.CoroutineScope

/** kotlinx-coroutines-test is overkill for two calls; expect/actual runBlocking is enough. */
expect fun runBlockingTest(block: suspend CoroutineScope.() -> Unit)
