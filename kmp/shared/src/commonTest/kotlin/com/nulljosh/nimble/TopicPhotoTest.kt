package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Mirrors Tests/TopicPhotoTests.swift. The network is a fake fetch: a Wikipedia title maps to its REST summary JSON,
 * a search returns `searchTitles`, and every URL asked for is recorded so "never looks" can be checked.
 */
class TopicPhotoTest {

    private class FakeWiki(
        private val summaries: Map<String, String> = emptyMap(),
        private val searchTitles: List<String> = emptyList(),
    ) {
        val requested = mutableListOf<String>()

        val get: TextFetch = { url ->
            requested.add(url)
            when {
                url.contains("list=search") ->
                    "{\"query\":{\"search\":[" + searchTitles.joinToString(",") { "{\"title\":\"$it\"}" } + "]}}"
                url.contains("/page/summary/") -> summaries[url.substringAfter("/page/summary/")]
                else -> null
            }
        }
    }

    private val parisPhoto = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Paris.jpg/800px-Paris.jpg"
    private val parisExtract = "Paris is the capital and most populous city of France."
    private val paris = summaryJson(
        title = "Paris", extract = parisExtract, thumb = parisPhoto,
        page = "https://en.wikipedia.org/wiki/Paris",
    )

    private fun summaryJson(title: String, extract: String, thumb: String? = null, type: String? = null, page: String? = null): String {
        val fields = mutableListOf("\"title\":\"$title\"", "\"extract\":\"$extract\"")
        if (type != null) fields.add("\"type\":\"$type\"")
        if (thumb != null) fields.add("\"thumbnail\":{\"source\":\"$thumb\"}")
        if (page != null) fields.add("\"content_urls\":{\"desktop\":{\"page\":\"$page\"}}")
        return "{" + fields.joinToString(",") + "}"
    }

    @Test
    fun topicPhotoComesFromTheNamedEntityWithItsCredit() = runBlockingTest {
        val wiki = FakeWiki(summaries = mapOf("Paris" to paris))
        val topic = TopicPhoto.lookup("What is the capital of France?", "The capital of France is Paris.", wiki.get)
        assertEquals(parisPhoto, topic?.photoUrl)
        assertEquals("Paris · Wikipedia", topic?.photoCredit)
        assertEquals(parisExtract, topic?.extract)
        assertEquals("https://en.wikipedia.org/wiki/Paris", topic?.page)
    }

    @Test
    fun mathUnitsWeatherAndTimeNeverLookForAPhoto() = runBlockingTest {
        val wiki = FakeWiki(summaries = mapOf("Paris" to paris))
        for (query in listOf("what is 2 plus 3", "convert 5 miles to km", "weather in Paris", "what time is it in Paris")) {
            assertNull(TopicPhoto.lookup(query, "Paris is the answer.", wiki.get), query)
        }
        assertTrue(wiki.requested.isEmpty())
    }

    @Test
    fun aLogoOnlyTopicGivesTheTextAndNoPicture() = runBlockingTest {
        val logo = summaryJson(
            title = "Paris", extract = "Paris is the capital of France.",
            thumb = "https://upload.wikimedia.org/wikipedia/en/thumb/b/ba/Paris_logo.svg/330px-Paris_logo.svg.png",
            page = "https://en.wikipedia.org/wiki/Paris",
        )
        val topic = TopicPhoto.lookup("What is the capital of France?", "The capital of France is Paris.", FakeWiki(mapOf("Paris" to logo)).get)
        assertNull(topic?.photoUrl)
        assertEquals("Paris is the capital of France.", topic?.extract)
    }

    @Test
    fun aDisambiguationPageIsSkipped() = runBlockingTest {
        val disambig = summaryJson(title = "Paris", extract = "Paris may refer to:", type = "disambiguation",
            page = "https://en.wikipedia.org/wiki/Paris")
        val topic = TopicPhoto.lookup("What is the capital of France?", "The capital of France is Paris.", FakeWiki(mapOf("Paris" to disambig)).get)
        assertNull(topic)
    }

    @Test
    fun theSearchHitsGiveTheTextButNeverThePhotoWhenTheAnswerNamesNothing() = runBlockingTest {
        val wiki = FakeWiki(summaries = mapOf("Paris" to paris), searchTitles = listOf("List of rivers", "Paris"))
        val topic = TopicPhoto.lookup("largest city in france", "It is big.", wiki.get)
        assertNull(topic?.photoUrl)
        assertEquals("https://en.wikipedia.org/wiki/Paris", topic?.page)
    }

    @Test
    fun thePhotoIsTheAnswersEntityNotTheEarthPageTheQuestionFound() = runBlockingTest {
        val earth = summaryJson(title = "Earth", extract = "Earth is the third planet from the Sun.",
            thumb = "https://upload.wikimedia.org/earth.jpg", page = "https://en.wikipedia.org/wiki/Earth")
        val jupiterPhoto = "https://upload.wikimedia.org/jupiter.jpg"
        val jupiter = summaryJson(title = "Jupiter", extract = "Jupiter is the largest planet in the Solar System.",
            thumb = jupiterPhoto, page = "https://en.wikipedia.org/wiki/Jupiter")
        val wiki = FakeWiki(summaries = mapOf("Jupiter" to jupiter), searchTitles = listOf("Earth"))
        val topic = TopicPhoto.lookup("largest planet", "Jupiter is the largest planet.", wiki.get)
        assertEquals(jupiterPhoto, topic?.photoUrl)
        assertEquals("Jupiter · Wikipedia", topic?.photoCredit)
    }

    @Test
    fun aPageThatNeverNamesTheEntityGivesNoPhoto() = runBlockingTest {
        val jupiter = summaryJson(title = "Jupiter", extract = "A gas giant with a ring system.",
            thumb = "https://upload.wikimedia.org/jupiter.jpg", page = "https://en.wikipedia.org/wiki/Jupiter")
        val topic = TopicPhoto.lookup("largest planet", "Jupiter is the largest planet.", FakeWiki(mapOf("Jupiter" to jupiter)).get)
        assertNull(topic?.photoUrl)
    }

    @Test
    fun anEchoedEntityNeedsASharedWordWithTheAnswer() = runBlockingTest {
        val fruit = summaryJson(title = "Apple", extract = "An apple is a round, edible fruit.",
            thumb = "https://upload.wikimedia.org/apple.jpg", page = "https://en.wikipedia.org/wiki/Apple")
        val topic = TopicPhoto.lookup("who founded apple", "Apple was founded by Steve Jobs.", FakeWiki(mapOf("Apple" to fruit)).get)
        assertNull(topic?.photoUrl)
    }

    @Test
    fun aNameWithAParticleStaysWhole() = runBlockingTest {
        val vinciTown = summaryJson(title = "Vinci", extract = "Vinci is a town in Italy.",
            thumb = "https://upload.wikimedia.org/vinci.jpg", page = "https://en.wikipedia.org/wiki/Vinci")
        val leo = summaryJson(title = "Leonardo da Vinci", extract = "Leonardo da Vinci was an Italian painter.",
            thumb = "https://upload.wikimedia.org/leo.jpg", page = "https://en.wikipedia.org/wiki/Leonardo_da_Vinci")
        val wiki = FakeWiki(summaries = mapOf("Vinci" to vinciTown, "Leonardo_da_Vinci" to leo))
        val topic = TopicPhoto.lookup("who painted the mona lisa", "Leonardo da Vinci painted it.", wiki.get)
        assertEquals("https://upload.wikimedia.org/leo.jpg", topic?.photoUrl)
        assertEquals(listOf("Leonardo da Vinci"), TopicPhoto.answerEntities("who painted the mona lisa", "Leonardo da Vinci painted it.").map { it.name })
    }

    @Test
    fun withTopicFillsTheWhyTextAndLinksThePageWhenNothingElseBacksTheAnswer() = runBlockingTest {
        val wiki = FakeWiki(summaries = mapOf("Paris" to paris))
        val answer = Answer.Text(null, "The capital of France is Paris.", "Gemma + Qwen")
        val result = TopicPhoto.withTopic(answer, "What is the capital of France?", wiki.get)
        assertEquals(parisExtract, result.grounding)
        assertEquals("https://en.wikipedia.org/wiki/Paris", result.sourceUrl)
        assertEquals(parisPhoto, result.photoUrl)
        assertEquals("Paris · Wikipedia", result.photoCredit)
    }

    @Test
    fun withTopicKeepsTheAnswersOwnPhotoAndFetchesNothing() = runBlockingTest {
        val wiki = FakeWiki(summaries = mapOf("Paris" to paris))
        val own = Answer.Text(null, "The capital of France is Paris.", "Gemma + Qwen", photoUrl = "https://example.org/own.jpg")
        val result = TopicPhoto.withTopic(own, "What is the capital of France?", wiki.get)
        assertEquals(own, result)
        assertTrue(wiki.requested.isEmpty())
    }

    @Test
    fun anSvgDiagramsRenderedPngIsAPhotoButARawSvgIsNot() {
        assertEquals(
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Photosynthesis_diagram.svg/800px-Photosynthesis_diagram.svg.png",
            leadPhoto("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Photosynthesis_diagram.svg/800px-Photosynthesis_diagram.svg.png"),
        )
        assertNull(leadPhoto("https://upload.wikimedia.org/wikipedia/commons/a/a4/Photosynthesis_diagram.svg"))
        assertNull(leadPhoto("https://upload.wikimedia.org/wikipedia/commons/a/a4/Diagram.gif"))
        assertNull(leadPhoto("http://upload.wikimedia.org/wikipedia/commons/a/a4/Paris.jpg"))
    }
}
