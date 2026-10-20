package com.nulljosh.nimble

import java.io.File
import java.util.zip.GZIPInputStream
import kotlin.test.Test

/**
 * The web's offline exam (test/exam-offline.js) on the Kotlin engine: the same 154 questions from test/exam.js, private
 * mode (no request leaves), the real offline pack from docs/pack. A measurement, not a gate: it writes the score and
 * every wrong pack answer to build/offline-exam.txt. Runs only with NIMBLE_EXAM=1, since it reads the 3 MB pack.
 */
class OfflineExamJvmTest {
    @Test
    fun offlineExam() = runBlockingTest {
        if (System.getenv("NIMBLE_EXAM") == null) return@runBlockingTest
        val repo = File("../..")
        // Each question is ["text",/regex/flags] in test/exam.js; JS and Java regexes agree on everything the exam uses.
        val q = Regex("""\["((?:[^"\\]|\\.)*)",/((?:[^/\\\n]|\\.)+)/([a-z]*)\]""").findAll(File(repo, "test/exam.js").readText()).map { m ->
            val opts = if ('i' in m.groupValues[3]) setOf(RegexOption.IGNORE_CASE) else emptySet()
            m.groupValues[1].replace("\\\"", "\"") to Regex(m.groupValues[2], opts)
        }.toList()
        val text = GZIPInputStream(File(repo, "docs/pack/wikipedia-top-v1.json.gz").inputStream()).bufferedReader().use { it.readText() }
        val pack = OfflinePack.parse(text)!!
        val client = AnswerClient(offlinePack = { pack }, privateMode = { true })
        var pass = 0
        val wrong = mutableListOf<String>()
        val missed = mutableListOf<String>()
        for ((question, re) in q) {
            val a = client.query(question)
            val shown = when (a) {
                is Answer.Math -> a.value
                is Answer.Text -> listOfNotNull(a.heading, a.body).joinToString(" ")
                is Answer.CardAnswer -> "${a.card.big} ${a.card.unit} ${a.card.sub}"
                else -> ""
            }
            if (re.containsMatchIn(shown)) pass++
            else if (a is Answer.Text && a.source.startsWith("Offline pack")) wrong += "$question => ${shown.take(70)}"
            else missed += "$question (${a::class.simpleName}: ${shown.take(40)})"
        }
        val report = "$pass/${q.size} pass offline (Kotlin, pack: ${pack.count} entries)\npack answered wrong: ${wrong.size}\n" + wrong.joinToString("\n") + "\nmissed:\n" + missed.joinToString("\n")
        File("build/offline-exam.txt").writeText(report)
        println(report)
    }

    /** BC Pre-Calculus 12 (test/exam-pc12.js, 281 questions on seven forms) on the Kotlin engine, private mode, no pack. */
    @Test
    fun preCalc12Exam() = runBlockingTest {
        if (System.getenv("NIMBLE_EXAM") == null) return@runBlockingTest
        val q = Regex("""\["((?:[^"\\]|\\.)*)",\s*/((?:[^/\\\n]|\\.)+)/([a-z]*)\]""").findAll(File("../../test/exam-pc12.js").readText()).map { m ->
            val opts = if ('i' in m.groupValues[3]) setOf(RegexOption.IGNORE_CASE) else emptySet()
            m.groupValues[1].replace("\\\"", "\"") to Regex(m.groupValues[2], opts)
        }.toList()
        val client = AnswerClient(privateMode = { true })
        val missed = mutableListOf<String>()
        for ((question, re) in q) {
            val shown = when (val a = client.query(question)) {
                is Answer.Math -> a.value
                is Answer.Text -> listOfNotNull(a.heading, a.body).joinToString(" ")
                else -> ""
            }.replace(Regex("[−‑–]"), "-")
            if (!re.containsMatchIn(shown)) missed += "$question => ${shown.take(60)}"
        }
        val report = "pc12 exam: ${q.size - missed.size}/${q.size} pass (Kotlin, offline)\nmissed:\n" + missed.joinToString("\n")
        File("build/pc12-exam.txt").writeText(report)
        println(report)
    }
}
