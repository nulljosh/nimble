package com.nulljosh.nimble

/** The text of a file in commonTest/resources/fixtures (saved ESPN payloads). Each platform reads its own classpath. */
expect fun readFixture(name: String): String
