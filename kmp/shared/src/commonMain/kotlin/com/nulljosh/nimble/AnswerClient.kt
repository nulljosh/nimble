package com.nulljosh.nimble

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.encodeURLParameter
import io.ktor.http.encodeURLPathPart
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

sealed class Answer {
    data class Math(val value: String) : Answer()
    data class Text(
        val heading: String?,
        val body: String,
        val source: String,
        val sourceUrl: String? = null,
        val imageUrl: String? = null,
    ) : Answer()
    data class Miss(val message: String, val searchUrl: String) : Answer()
}

/**
 * Gemma proxy -> DuckDuckGo -> Wikipedia, same chain and same endpoints as the Swift and
 * web implementations. Every stage returns null on failure so the next one gets a turn;
 * a dead network degrades to Miss rather than throwing.
 */
class AnswerClient(private val http: HttpClient = defaultClient()) {

    companion object {
        // The Cloudflare Worker holds the key; nothing secret ships in the app.
        private const val PROXY = "https://nimble-answers.trommatic.workers.dev"

        private val lenientJson = Json { ignoreUnknownKeys = true; isLenient = true }

        fun defaultClient(): HttpClient = HttpClient {
            install(ContentNegotiation) { json(lenientJson) }
            install(HttpTimeout) {
                requestTimeoutMillis = 8_000
                connectTimeoutMillis = 8_000
            }
        }
    }

    suspend fun query(input: String): Answer {
        QueryEngine.evaluateMath(input)?.let { return Answer.Math(it) }

        // AI answers have no source page; give them a web search so every answer opens somewhere.
        gemma(input)?.let { return it.copy(sourceUrl = "https://duckduckgo.com/?q=${input.encodeURLParameter()}") }

        val (ddgQuery, wikiQuery) = QueryEngine.preprocess(input)
        ddg(ddgQuery)?.let { return it }
        wikipedia(wikiQuery)?.let { return it }

        return Answer.Miss(
            "No instant answer found.",
            "https://duckduckgo.com/?q=${input.encodeURLParameter()}"
        )
    }

    @Serializable
    private data class ProxyBody(val q: String)

    @Serializable
    private data class ProxyResponse(val answer: String? = null, val source: String? = null)

    private suspend fun gemma(input: String): Answer.Text? = runCatchingNull {
        val res = http.post(PROXY) {
            contentType(ContentType.Application.Json)
            setBody(ProxyBody(input))
        }
        val decoded = lenientJson.decodeFromString<ProxyResponse>(res.bodyAsText())
        val answer = decoded.answer?.trim().orEmpty()
        if (answer.isEmpty() || answer.uppercase() == "UNKNOWN") return@runCatchingNull null
        Answer.Text(heading = null, body = answer, source = decoded.source ?: "Nimble")
    }

    @Serializable
    private data class DdgResponse(
        @SerialName("AbstractText") val abstractText: String? = null,
        @SerialName("AbstractSource") val abstractSource: String? = null,
        @SerialName("AbstractURL") val abstractUrl: String? = null,
        @SerialName("Answer") val answer: String? = null,
        @SerialName("Definition") val definition: String? = null,
        @SerialName("DefinitionSource") val definitionSource: String? = null,
        @SerialName("DefinitionURL") val definitionUrl: String? = null,
        @SerialName("Heading") val heading: String? = null,
        @SerialName("Image") val image: String? = null,
    )

    private val htmlTag = Regex("<[^>]+>")

    private suspend fun ddg(input: String): Answer.Text? = runCatchingNull {
        val url = "https://api.duckduckgo.com/?q=${input.encodeURLParameter()}" +
            "&format=json&no_html=1&skip_disambig=1"
        val d = lenientJson.decodeFromString<DdgResponse>(http.get(url).bodyAsText())

        d.answer?.takeIf { it.isNotEmpty() }?.let {
            return@runCatchingNull Answer.Text(null, it.replace(htmlTag, ""), "DuckDuckGo")
        }
        d.definition?.takeIf { it.isNotEmpty() }?.let {
            return@runCatchingNull Answer.Text(
                d.heading, it, d.definitionSource ?: "DuckDuckGo", d.definitionUrl
            )
        }
        d.abstractText?.takeIf { it.isNotEmpty() }?.let {
            return@runCatchingNull Answer.Text(
                d.heading,
                it,
                d.abstractSource ?: "DuckDuckGo",
                d.abstractUrl,
                d.image?.takeIf { img -> img.isNotEmpty() }?.let { img -> "https://duckduckgo.com$img" }
            )
        }
        null
    }

    @Serializable
    private data class WikiSummary(
        val title: String? = null,
        val extract: String? = null,
        val thumbnail: WikiThumb? = null,
        @SerialName("content_urls") val contentUrls: WikiUrls? = null,
    )

    @Serializable private data class WikiThumb(val source: String? = null)
    @Serializable private data class WikiUrls(val desktop: WikiDesktop? = null)
    @Serializable private data class WikiDesktop(val page: String? = null)

    private suspend fun wikipedia(input: String): Answer.Text? {
        summary(input.replace(" ", "_"))?.let { return it }

        // No direct page: ask the search API what the article is actually called.
        val title = runCatchingNull {
            val url = "https://en.wikipedia.org/w/api.php?action=query&list=search" +
                "&srsearch=${input.encodeURLParameter()}&format=json&srlimit=1"
            Regex("\"title\"\\s*:\\s*\"(.*?)\"").find(http.get(url).bodyAsText())?.groupValues?.get(1)
        } ?: return null

        return summary(title.replace(" ", "_"))
    }

    private suspend fun summary(titlePath: String): Answer.Text? = runCatchingNull {
        val url = "https://en.wikipedia.org/api/rest_v1/page/summary/${titlePath.encodeURLPathPart()}"
        val w = lenientJson.decodeFromString<WikiSummary>(http.get(url).bodyAsText())
        val extract = w.extract?.takeIf { it.isNotEmpty() } ?: return@runCatchingNull null
        Answer.Text(w.title, extract, "Wikipedia", w.contentUrls?.desktop?.page, w.thumbnail?.source)
    }
}

/** Network and parse failures are misses, not crashes -- every stage can fall through. */
private inline fun <T> runCatchingNull(block: () -> T?): T? =
    try { block() } catch (_: Throwable) { null }
