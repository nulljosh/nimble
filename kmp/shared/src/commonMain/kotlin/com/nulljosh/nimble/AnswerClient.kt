package com.nulljosh.nimble

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.encodeURLParameter
import io.ktor.http.encodeURLPathPart
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

sealed class Answer {
    data class Math(val value: String) : Answer()
    /** Etymology, weather, local time or currency: one big number and a quiet line. */
    data class CardAnswer(val card: Card) : Answer()
    data class Text(
        val heading: String?,
        val body: String,
        val source: String,
        val sourceUrl: String? = null,
        /** Small icon beside a site answer (favicon). */
        val imageUrl: String? = null,
        /** Lead photo above the answer, cropped to 16:9 from the top. https only. */
        val photoUrl: String? = null,
        /** The photo's credit line, "<Title> · Wikipedia", when the photo came from a Wikipedia topic. */
        val photoCredit: String? = null,
        /** The Wikipedia intro behind the answer, shown under "Why this answer". Null when nothing backs it. */
        val grounding: String? = null,
    ) : Answer()
    /** "news" or "what's happening in <place>": up to three headlines from the worker's RSS route. */
    data class News(val items: List<NewsItem>, val source: String) : Answer()
    data class Miss(val message: String, val searchUrl: String) : Answer()
}

/** One story: the sentence, the outlet, the link, and a thumbnail when the feed has one (https only). */
data class NewsItem(val sentence: String, val outlet: String, val url: String, val imageUrl: String? = null)

/**
 * Math -> cards (etymology, weather, time, currency) -> Gemma proxy -> DuckDuckGo -> Wikipedia, same chain and same endpoints as the Swift and
 * web implementations. Every stage returns null on failure so the next one gets a turn;
 * a dead network degrades to Miss rather than throwing.
 */
class AnswerClient(private val http: HttpClient = defaultClient()) {

    private val cards = CardClient(http)

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

    /** Raw bytes of a small image such as a site favicon; null on any failure. */
    suspend fun imageBytes(url: String): ByteArray? = runCatchingNull { http.get(url).readRawBytes() }

    suspend fun query(input: String): Answer {
        QueryEngine.evaluateMath(input)?.let { return Answer.Math(it) }

        // A bare domain question ("What's primitive.dev?") is answered by the site itself, before any AI or encyclopedia.
        site(input)?.let { return it }

        // Pattern-gated live cards come before the AI, same order as the web: etymology, weather, time, currency.
        cards.card(input)?.let { return Answer.CardAnswer(it) }

        // News is gated before the AI so "news" never gets an invented answer. A failed feed falls through.
        newsPlace(input)?.let { place -> news(place)?.let { return it } }

        // AI answers have no source page; give them a web search so every answer opens somewhere.
        // An AI answer with no proxy photo takes the picture and intro of the Wikipedia topic it names (TopicPhoto).
        gemma(input)?.let { ai ->
            val answer = ai.copy(sourceUrl = ai.sourceUrl ?: "https://duckduckgo.com/?q=${input.encodeURLParameter()}")
            return TopicPhoto.withTopic(answer, input) { fetchText(it) }
        }

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

    private suspend fun gemma(input: String): Answer.Text? = runCatchingNull {
        val res = http.post(PROXY) {
            contentType(ContentType.Application.Json)
            setBody(ProxyBody(input))
        }
        proxyAnswer(res.bodyAsText())
    }

    private suspend fun news(place: String): Answer.News? = runCatchingNull {
        newsFromJson(http.get("$PROXY/?news=${place.encodeURLParameter()}").bodyAsText())
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
                firstSentence(it),
                d.abstractSource ?: "DuckDuckGo",
                d.abstractUrl,
                photoUrl = d.image?.takeIf { img -> img.isNotEmpty() }?.let { img -> "https://duckduckgo.com$img" },
            )
        }
        null
    }

    /** Body text of a URL, or null on a network failure or any non-200 reply. */
    private suspend fun fetchText(url: String): String? = runCatchingNull {
        val res = http.get(url)
        if (res.status == HttpStatusCode.OK) res.bodyAsText() else null
    }

    private suspend fun wikipedia(input: String): Answer.Text? {
        summary(input.replace(" ", "_"))?.let { return it }

        // No direct page: ask the search API what the article is actually called.
        val title = articleTitle(runCatchingNull {
            val url = "https://en.wikipedia.org/w/api.php?action=query&list=search" +
                "&srsearch=${input.encodeURLParameter()}&format=json&srlimit=1"
            Regex("\"title\"\\s*:\\s*\"(.*?)\"").find(http.get(url).bodyAsText())?.groupValues?.get(1)
        }) ?: return null

        return summary(title.replace(" ", "_"))
    }

    @Serializable
    internal data class SiteResponse(
        val host: String? = null,
        val title: String? = null,
        val siteName: String? = null,
        val description: String? = null,
        val h1: String? = null,
        val text: String? = null,
        val js: Boolean? = null,
    )

    private suspend fun site(input: String): Answer.Text? {
        val host = siteHost(input) ?: return null
        return runCatchingNull {
            val d = lenientJson.decodeFromString<SiteResponse>(
                http.get("$PROXY/?site=${host.encodeURLParameter()}").bodyAsText()
            )
            siteAnswer(host, d)
        }
    }

    private suspend fun summary(titlePath: String): Answer.Text? = runCatchingNull {
        val url = "https://en.wikipedia.org/api/rest_v1/page/summary/${titlePath.encodeURLPathPart()}"
        val w = lenientJson.decodeFromString<WikiSummary>(http.get(url).bodyAsText())
        val extract = w.extract?.takeIf { it.isNotEmpty() } ?: return@runCatchingNull null
        Answer.Text(
            w.title, firstSentence(extract), "Wikipedia", w.contentUrls?.desktop?.page,
            photoUrl = leadPhoto(w.thumbnail?.source),
        )
    }
}

/** A Wikipedia REST summary: the title, intro, lead image, page link and type ("disambiguation" pages are skipped). */
@Serializable
internal data class WikiSummary(
    val title: String? = null,
    val type: String? = null,
    val extract: String? = null,
    val thumbnail: WikiThumb? = null,
    @SerialName("content_urls") val contentUrls: WikiUrls? = null,
)

@Serializable internal data class WikiThumb(val source: String? = null)
@Serializable internal data class WikiUrls(val desktop: WikiDesktop? = null)
@Serializable internal data class WikiDesktop(val page: String? = null)

/**
 * Same pattern as `SITE_RE` in docs/engine.js and `siteHost()` in Sources/Models/QueryEngine.swift.
 * Only a bare host (optional question wording, scheme, www, path) matches; "what is node.js" does not.
 */
private val siteRe = Regex(
    """^(?:(?:what(?:['’]s|\s+is)|whats|who(?:['’]s|\s+is)|tell me about|about)\s+)?(?:the\s+)?(?:https?://)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:com|net|org|dev|io|ai|app|co|ca|me|xyz|tv|gg|so|sh|to|fm|cc|us|uk|info|biz|tech|cloud|site|online|page|wiki|design|studio))(?:/\S*)?(?:\s+(?:website|site|company|app))?\s*\??$""",
    RegexOption.IGNORE_CASE
)

internal fun siteHost(query: String): String? =
    siteRe.find(query.trim())?.groupValues?.get(1)?.lowercase()

/**
 * Body: meta description, else "h1. text", else a JavaScript note when the page ships scripts, else title.
 * Heading: page title, else siteName, else host. Icon: Google's favicon service for the host.
 */
internal fun siteAnswer(host: String, d: AnswerClient.SiteResponse): Answer.Text? {
    val body = d.description?.takeIf { it.isNotEmpty() }
        ?: listOfNotNull(d.h1, d.text).filter { it.isNotEmpty() }.joinToString(". ").takeIf { it.isNotEmpty() }
        ?: (if (d.js == true) "This site loads with JavaScript." else d.title?.takeIf { it.isNotEmpty() })
        ?: return null
    val heading = d.title?.takeIf { it.isNotEmpty() } ?: d.siteName?.takeIf { it.isNotEmpty() } ?: host
    return Answer.Text(
        heading = heading,
        body = firstSentence(body),
        source = host,
        sourceUrl = "https://$host",
        imageUrl = "https://www.google.com/s2/favicons?domain=$host&sz=64",
    )
}

/** The worker's `/?q=` reply. `image` is an object `{url, width, height}`; a string here would drop the whole answer. */
internal fun proxyAnswer(body: String): Answer.Text? {
    val d = rich.decodeFromString<ProxyReply>(body)
    val answer = d.answer?.trim().orEmpty()
    if (answer.isEmpty() || answer.uppercase() == "UNKNOWN") return null
    // The proxy's named Wikipedia page (topic, topicUrl) credits the photo and links the Why text. Older proxies send neither.
    val url = d.topicUrl?.takeIf { it.startsWith("https://en.wikipedia.org/wiki/") }
    val title = d.topic?.trim()?.takeIf { it.isNotEmpty() && url != null }
    val photo = httpsOnly(d.image?.url)
    return Answer.Text(
        heading = null,
        body = answer,
        source = d.source ?: "Nimble",
        sourceUrl = url.takeIf { title != null },
        photoUrl = photo,
        photoCredit = title?.takeIf { photo != null }?.let { "$it \u00B7 Wikipedia" },
        grounding = title?.let { t -> d.refs.orEmpty().firstOrNull { it.url == url }?.extract?.takeIf { it.isNotBlank() } },
    )
}

@Serializable
private data class ProxyReply(
    val answer: String? = null,
    val source: String? = null,
    val image: RichImage? = null,
    val topic: String? = null,
    val topicUrl: String? = null,
    val refs: List<ProxyRef>? = null,
)

@Serializable
private data class ProxyRef(val title: String? = null, val url: String? = null, val extract: String? = null)

@Serializable
private data class RichImage(val url: String? = null)

/** The worker's `/?news=` reply: items with sentence, outlet, url and an optional image object. */
internal fun newsFromJson(body: String): Answer.News? {
    val items = try { rich.decodeFromString<NewsReply>(body).items } catch (_: Exception) { return null }
    val top = items.asSequence().mapNotNull { row ->
        val sentence = row.sentence.orEmpty()
        val url = row.url.orEmpty()
        if (sentence.isEmpty() || !(url.startsWith("https://") || url.startsWith("http://"))) return@mapNotNull null
        NewsItem(sentence, row.outlet.orEmpty(), url, httpsOnly(row.image?.url))
    }.take(3).toList()
    if (top.isEmpty()) return null
    return Answer.News(top, top.map { it.outlet }.filter { it.isNotEmpty() }.distinct().joinToString(", "))
}

@Serializable
private data class NewsReply(val items: List<NewsRow> = emptyList())

@Serializable
private data class NewsRow(val sentence: String? = null, val outlet: String? = null, val url: String? = null, val image: RichImage? = null)

private val rich = Json { ignoreUnknownKeys = true; isLenient = true }

/** Same as Swift's AnswerPhoto.https: only https photos are shown. */
internal fun httpsOnly(url: String?): String? = url?.takeIf { it.lowercase().startsWith("https://") }

/**
 * Wikipedia's lead image, unless it is a logo, flag, icon or map, or not a png, jpg, jpeg or webp. A raw .svg is never a
 * photo; an SVG diagram's rendered ".svg.png" is. Same rule as Swift's `AnswerPhoto.wikipediaLead`.
 */
internal fun leadPhoto(url: String?): String? =
    httpsOnly(url)?.takeIf { !leadSkip.containsMatchIn(it) && leadRaster.containsMatchIn(it) }

private val leadSkip = Regex("""\.svg(\?|$)|logo|flag|icon|coat[_ ]of[_ ]arms|seal|map|commons-""", RegexOption.IGNORE_CASE)
private val leadRaster = Regex("""\.(png|jpe?g|webp)(\?|$)""", RegexOption.IGNORE_CASE)

private val newsWorld = Regex("""^(?:(?:latest|top|breaking)\s+)?news\s*\??$|^what(?:'s|\u2019s| is) happening\s*\??$""", RegexOption.IGNORE_CASE)
private val newsIn = Regex("""^(?:(?:latest|top|breaking)\s+)?news\s+(?:in|from|for|around)\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE)
private val happeningIn = Regex("""^what(?:'s|\u2019s| is) happening\s+(?:in|at|around)\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE)

/** The place for a news question: "" for the world feed, the place name, or null when the input is not news. */
internal fun newsPlace(input: String): String? {
    val q = input.trim()
    if (newsWorld.containsMatchIn(q)) return ""
    return (newsIn.find(q) ?: happeningIn.find(q))?.groupValues?.get(1)?.trim()
}

/** Wikipedia list articles ("List of ...") are never answers. */
internal fun articleTitle(raw: String?): String? = raw?.takeUnless { it.startsWith("List of ", ignoreCase = true) }

/** Network and parse failures are misses, not crashes -- every stage can fall through. */
private inline fun <T> runCatchingNull(block: () -> T?): T? =
    try { block() } catch (_: Throwable) { null }

// ponytail: encyclopedia paragraphs are not answers; keep the first sentence.
private val sentenceBreak = Regex("""(?<=[.!?])\s+(?=[A-Z0-9"(])""")
internal fun firstSentence(text: String): String = text.trim().split(sentenceBreak, limit = 2)[0]
