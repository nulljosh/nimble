package com.nulljosh.nimble

actual fun readFixture(name: String): String =
    Thread.currentThread().contextClassLoader!!.getResourceAsStream("fixtures/$name")!!.bufferedReader().use { it.readText() }
