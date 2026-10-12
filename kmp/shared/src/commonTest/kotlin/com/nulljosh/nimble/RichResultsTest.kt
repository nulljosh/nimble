package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Offline decoders for the rich results: answer photos, news items and the place gate. */
class RichResultsTest {

    @Test
    fun proxyAnswerReadsTheImageObject() {
        val a = proxyAnswer(
            """{"answer":"Ottawa is the capital of Canada.","source":"Gemma","image":{"url":"https://upload.wikimedia.org/a.jpg","width":800,"height":600}}"""
        )
        assertEquals("https://upload.wikimedia.org/a.jpg", a?.photoUrl)
        assertEquals("Ottawa is the capital of Canada.", a?.body)
        assertEquals("Gemma", a?.source)
    }

    @Test
    fun proxyAnswerWithoutImageHasNoPhoto() {
        val a = proxyAnswer("""{"answer":"Forty-two.","source":"Samantha"}""")
        assertEquals("Forty-two.", a?.body)
        assertNull(a?.photoUrl)
    }

    @Test
    fun proxyAnswerDropsPlainHttpPhotos() {
        val a = proxyAnswer("""{"answer":"Forty-two.","image":{"url":"http://example.com/a.jpg"}}""")
        assertNull(a?.photoUrl)
    }

    @Test
    fun proxyAiErrorIsReadOnlyWhenPresent() {
        assertEquals("AiError: quota", proxyAiError("""{"answer":"UNKNOWN","aiError":"AiError: quota"}"""))
        assertNull(proxyAiError("""{"answer":"UNKNOWN"}"""))
        assertNull(proxyAiError("""{"answer":"UNKNOWN","aiError":""}"""))
        assertNull(proxyAiError("not json"))
    }

    @Test
    fun aiRestingNoteOnlyUnderAWikipediaFallbackWithAnError() {
        assertEquals("The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening.", aiRestingNote("capacity", "Wikipedia"))
        assertNull(aiRestingNote(null, "Wikipedia"))
        assertNull(aiRestingNote("capacity", "DuckDuckGo"))
    }

    @Test
    fun proxyUnknownIsNotAnAnswer() {
        assertNull(proxyAnswer("""{"answer":"UNKNOWN"}"""))
        assertNull(proxyAnswer("""{"answer":"  "}"""))
    }

    @Test
    fun newsKeepsThreeStoriesWithOptionalThumbnails() {
        val news = newsFromJson(
            """
            {"items":[
              {"title":"A","sentence":"Storm hits the coast.","outlet":"BBC","url":"https://bbc.example/a","image":{"url":"https://img.example/a.jpg","width":320,"height":180}},
              {"title":"B","sentence":"Council votes.","outlet":"CBC","url":"https://cbc.example/b","image":null},
              {"title":"C","sentence":"Rain returns.","outlet":"CBC","url":"https://cbc.example/c"},
              {"title":"D","sentence":"Fourth story.","outlet":"NPR","url":"https://npr.example/d"}
            ]}
            """.trimIndent()
        )
        assertTrue(news != null)
        assertEquals(3, news.items.size)
        assertEquals("https://img.example/a.jpg", news.items[0].imageUrl)
        assertNull(news.items[1].imageUrl)
        assertEquals("BBC, CBC", news.source)
    }

    @Test
    fun newsDropsBadLinksAndEmptySentences() {
        val news = newsFromJson(
            """{"items":[
              {"sentence":"No link.","outlet":"X","url":"javascript:alert(1)"},
              {"sentence":"","outlet":"Y","url":"https://y.example/1"},
              {"sentence":"Kept.","outlet":"Z","url":"https://z.example/1","image":{"url":"http://insecure.example/x.jpg"}}
            ]}"""
        )
        assertEquals(1, news?.items?.size)
        assertEquals("Kept.", news?.items?.first()?.sentence)
        assertNull(news?.items?.first()?.imageUrl)
    }

    @Test
    fun newsEmptyOrBrokenIsNull() {
        assertNull(newsFromJson("""{"items":[]}"""))
        assertNull(newsFromJson("""{}"""))
        assertNull(newsFromJson("not json"))
    }

    @Test
    fun newsPlaceGate() {
        assertEquals("", newsPlace("news"))
        assertEquals("", newsPlace("Latest news?"))
        assertEquals("", newsPlace("what's happening"))
        assertEquals("Vancouver", newsPlace("news in Vancouver"))
        assertEquals("Vancouver", newsPlace("What’s happening in Vancouver?"))
        assertEquals("Canada", newsPlace("top news from Canada"))
        assertNull(newsPlace("population of Canada"))
        assertNull(newsPlace("newsroom design"))
    }

    @Test
    fun leadPhotoSkipsLogosAndDrawings() {
        assertEquals("https://upload.wikimedia.org/x/Ottawa.jpg", leadPhoto("https://upload.wikimedia.org/x/Ottawa.jpg"))
        assertNull(leadPhoto("https://upload.wikimedia.org/x/Canada_coat_of_arms.svg.png"))
        assertNull(leadPhoto("https://upload.wikimedia.org/x/Flag_of_Canada.jpg"))
        assertNull(leadPhoto("http://upload.wikimedia.org/x/Ottawa.jpg"))
    }

    @Test
    fun proxyTopicCreditsItsPhotoAndLinksTheWhyText() {
        val a = proxyAnswer(
            """{"answer":"Hamlet was written by William Shakespeare.","source":"Gemma + Qwen",""" +
                """"image":{"url":"https://upload.wikimedia.org/h.jpg"},""" +
                """"refs":[{"title":"Hamlet","url":"https://en.wikipedia.org/wiki/Hamlet","extract":"Hamlet is a tragedy."}],""" +
                """"topic":"Hamlet","topicUrl":"https://en.wikipedia.org/wiki/Hamlet"}"""
        )!!
        assertEquals("Hamlet \u00B7 Wikipedia", a.photoCredit)
        assertEquals("https://en.wikipedia.org/wiki/Hamlet", a.sourceUrl)
        assertEquals("Hamlet is a tragedy.", a.grounding)
    }

    @Test
    fun proxyTopicWithoutPhotoOrWithAForeignLinkIsIgnored() {
        val noPhoto = proxyAnswer("""{"answer":"Paris.","topic":"Paris","topicUrl":"https://en.wikipedia.org/wiki/Paris"}""")!!
        assertNull(noPhoto.photoCredit)
        val foreign = proxyAnswer(
            """{"answer":"Paris.","image":{"url":"https://example.com/p.jpg"},"topic":"Paris","topicUrl":"https://evil.example/Paris"}"""
        )!!
        assertNull(foreign.sourceUrl)
        assertNull(foreign.photoCredit)
    }
}
