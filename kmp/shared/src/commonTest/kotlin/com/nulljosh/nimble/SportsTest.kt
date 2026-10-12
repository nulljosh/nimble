package com.nulljosh.nimble

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Sports scores, offline. Mirrors test/sports.test.js and Tests/SportsTests.swift: the fetch is a fake that answers
 * per ESPN league and day, and records every call in order. The saved ESPN payloads are the same trimmed fixtures.
 */
class SportsTest {

    private val nfl0811 = readFixture("espn-nfl-20261011.json")   // Final, Final, Final/OT (Commanders and Giants tied)
    private val nfl0812 = readFixture("espn-nfl-20261012.json")   // Rams and Bills, not yet played
    // ESPN's default scoreboard (no dates), saved live on Oct 12: Bucs 24 at Cowboys 16 (Final, Thu Oct 8 ET),
    // Bears 7 at Packers 31 (Final, Sun Oct 11), Bills at Rams (not yet played). Trimmed to these three games.
    private val nflDefault = readFixture("espn-nfl-default.json")
    // ESPN's default NBA scoreboard, saved live on Oct 12: two preseason games, no Lakers.
    private val nbaDefault = readFixture("espn-nba-default.json")
    private val now = 1791835200_000L                             // 2026-10-12 20:00 UTC, 1:00 pm in Vancouver
    private val tz = "America/Vancouver"
    private val failure = SPORTS_FAILURE                          // route marker: a failed request

    /** Answers per "league|yyyymmdd". A route to [failure] is a failed request; a missing route has no games. */
    private class Espn(private val routes: Map<String, String>) {
        val calls = mutableListOf<String>()
        val fetch: suspend (String) -> String? = { url ->
            assertTrue(url.startsWith("https://site.api.espn.com/"), "unexpected host: $url")
            val dates = if ("dates=" in url) url.substringAfter("dates=") else ""
            val key = url.substringAfter("/sports/").substringBefore("/scoreboard") + "|" + dates
            calls.add(key)
            when (val hit = routes[key]) {
                null -> "{\"events\":[]}"
                SPORTS_FAILURE -> null
                else -> hit
            }
        }
    }

    private fun event(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject
    private fun firstEvent(body: String): JsonObject = Json.parseToJsonElement(body).jsonObject["events"]!!.jsonArray[0].jsonObject

    private fun eventWithStatus(status: String) = event("""{"date":"2026-10-12T20:15Z","status":$status,"competitions":[]}""")

    // MARK: Detection

    @Test
    fun teamAndLeagueDetection() {
        for (q in listOf("lakers score", "did the canucks win", "who won the lakers game", "canucks game last night", "lakers", "the canucks",
            "bills score", "did the lakers win", "who won the bills game", "Lakers!?", "man city score", "kings score")) {
            assertNotNull(sportsAsk(q), q)
        }
        assertTrue((sportsAsk("canucks game last night") as SportsAsk.ByTeam).lastNight)
        assertFalse((sportsAsk("lakers score") as SportsAsk.ByTeam).lastNight)
        for (q in listOf("nfl scores", "premier league scores", "epl results", "NFL scores", "last night's nba scores")) {
            assertTrue(sportsAsk(q) is SportsAsk.ByLeague, q)
        }
    }

    @Test
    fun detectionNeverHijacksMathMarketsWeatherOrOrdinaryQuestions() {
        for (q in listOf("who won the war", "who won the world cup", "who is the president", "a+b", "2 + 2", "5 miles to km",
            "bitcoin price", "AAPL", "AAPL stock", "NFL", "NBA", "weather in vancouver", "what is apple", "is apple good",
            "heat", "jazz", "magic", "kings", "nets", "the sun", "bills due", "chicken nuggets", "how to heat soup", "give me a magic trick",
            "lakers history", "who is the lakers coach", "news about the lakers", "lakers news yesterday",
            "will the lakers win the title", "should I bet on the lakers", "why did the lakers lose", "how many wins do the lakers have")) {
            assertNull(sportsAsk(q), q)
        }
    }

    @Test
    fun stockTickersKeepTheLeagueCodesOut() {
        for (code in listOf("NFL", "NBA", "MLB", "NHL", "MLS", "EPL")) assertNull(Markets.stockSymbol(code), code)
    }

    @Test
    fun noRequestWhenTheQuestionIsNotSports() = runBlockingTest {
        val espn = Espn(emptyMap())
        assertNull(Scores.answer("2 + 2", now, tz, espn.fetch))
        assertNull(Scores.answer("bitcoin price", now, tz, espn.fetch))
        assertTrue(espn.calls.isEmpty())
    }

    // MARK: Parsing

    @Test
    fun finishedGameParsesWithOurTeamFirstAndTheWinnerMarked() {
        val ev = firstEvent(nfl0811)
        val ours = ev.competitors().first { it["team"]!!.jsonObject["shortDisplayName"]!!.toString().contains("Jaguars") }
        val r = gameRow(ev, ours, "nfl", now, tz)
        assertEquals(listOf(SportsTeam("Jaguars", "19", true), SportsTeam("Eagles", "17", false)), r.teams)
        assertEquals("Final", r.status)
        assertEquals("post", r.state)
    }

    @Test
    fun overtimeTieSaysSoInWordsWithNoWinnerMarked() {
        val ev = nflEvent(nfl0811, 2)
        val ours = ev.competitors().first { it["team"]!!.jsonObject["shortDisplayName"]!!.toString().contains("Commanders") }
        val r = gameRow(ev, ours, "nfl", now, tz)
        assertEquals("Final/OT, tied", r.status)
        assertTrue(r.teams.none { it.winner })
    }

    @Test
    fun gameBeforeKickoffShowsTheTimeInTheZoneAndNoScore() {
        val ev = firstEvent(nfl0812)
        val ours = ev.competitors().first { it["team"]!!.jsonObject["shortDisplayName"]!!.toString().contains("Bills") }
        val r = gameRow(ev, ours, "nfl", now, tz)
        assertEquals("Scheduled for 5:15 pm", r.status)
        assertEquals(listOf("Bills", "Rams"), r.teams.map { it.name })
        assertTrue(r.teams.all { it.score == "" })
    }

    @Test
    fun kickoffOnAnotherDayNamesTheDay() {
        assertEquals("Oct 12, 5:15 pm", kickoffLabel("2026-10-13T00:15Z", 1791748800_000L, tz))
        assertEquals("", kickoffLabel("not a date", now, tz))
    }

    @Test
    fun liveStatusIsPeriodAndClockForQuartersAndPeriodsAndESPNTextForTheRest() {
        fun st(s: String, lg: String) = sportsStatus(eventWithStatus(s), lg, now, tz)
        assertEquals("3rd quarter 4:12", st("""{"period":3,"displayClock":"4:12","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"3rd Quarter - 4:12","shortDetail":"4:12 - 3rd"}}""", "nfl"))
        assertEquals("2nd period 12:04", st("""{"period":2,"displayClock":"12:04","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"2nd Period - 12:04","shortDetail":"2nd 12:04"}}""", "nhl"))
        assertEquals("3:00 - OT", st("""{"period":5,"displayClock":"3:00","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"OT - 3:00","shortDetail":"3:00 - OT"}}""", "nfl"))
        assertEquals("Halftime", st("""{"period":2,"displayClock":"0:00","type":{"name":"STATUS_HALFTIME","state":"in","detail":"Halftime","shortDetail":"Halftime"}}""", "nfl"))
        assertEquals("Final/OT", st("""{"period":5,"displayClock":"0:00","type":{"name":"STATUS_FINAL","state":"post","detail":"Final/OT","shortDetail":"Final/OT"}}""", "mlb"))
        assertEquals("32'", st("""{"period":1,"displayClock":"32'","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"32'","shortDetail":"32'"}}""", "epl"))
    }

    // MARK: Day order and states

    @Test
    fun todayHasTheGameSoOneScoreboardCallAndNoYesterday() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|20261012" to nfl0812))
        val card = Scores.answer("bills score", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals("Bills", card.title)
        assertEquals(SportsState.Scores, card.state)
        assertEquals("pre", card.rows[0].state)
        assertEquals("Bills", card.rows[0].teams[0].name)
        assertEquals(listOf("football/nfl|20261012"), espn.calls)
    }

    @Test
    fun dateFallbackNoGameTodayThenFoundYesterday() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|20261011" to nfl0811))
        val card = Scores.answer("did the jaguars win", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(listOf("football/nfl|20261012", "football/nfl|20261011"), espn.calls)
        val jaguars = card.rows[0].teams[0]
        assertEquals(SportsTeam("Jaguars", "19", true), jaguars)
        assertEquals(false, card.rows[0].teams[1].winner)
        assertEquals("Final", card.rows[0].status)
        assertEquals(Freshness(now, false), card.asOf)
    }

    @Test
    fun lastNightIsYesterdayOnly() = runBlockingTest {
        val espn = Espn(mapOf("hockey/nhl|20261011" to "{\"events\":[]}"))
        val card = Scores.answer("canucks game last night", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(listOf("hockey/nhl|20261011", "hockey/nhl|"), espn.calls.take(2))
        assertFalse(espn.calls.contains("hockey/nhl|20261012"))
        assertEquals(SportsState.NoGame, card.state)
        assertTrue(card.lastNight)
    }

    @Test
    fun aTeamInTwoLeaguesIsCheckedInEachBeforeAGameIsCalledMissing() = runBlockingTest {
        val espn = Espn(emptyMap())
        val card = Scores.answer("kings score", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(
            listOf("basketball/nba|20261012", "hockey/nhl|20261012", "basketball/nba|20261011", "hockey/nhl|20261011"),
            espn.calls.take(4),
        )
        assertEquals(SportsState.NoGame, card.state)
    }

    @Test
    fun noGameInTheLastWeekChecksEverySevenDaysBack() = runBlockingTest {
        val espn = Espn(mapOf("basketball/nba|" to nbaDefault))
        val card = Scores.answer("lakers score", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(SportsState.NoGame, card.state)
        assertEquals("Lakers", card.title)
        assertEquals("No game found for the Lakers in the last week", card.noGameLine())
        assertEquals(listOf("basketball/nba|20261012", "basketball/nba|20261011", "basketball/nba|",
            "basketball/nba|20261010", "basketball/nba|20261009", "basketball/nba|20261008",
            "basketball/nba|20261007", "basketball/nba|20261006", "basketball/nba|20261005"), espn.calls)
    }

    @Test
    fun cowboysOnTheCurrentBoardIsFinalAndDatedInWords() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|" to nflDefault))
        val card = Scores.answer("cowboys score", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(SportsState.Scores, card.state)
        assertEquals(listOf("football/nfl|20261012", "football/nfl|20261011", "football/nfl|"), espn.calls)
        assertEquals(listOf(SportsTeam("Cowboys", "16", false), SportsTeam("Buccaneers", "24", true)), card.rows[0].teams)
        assertEquals("Final, Thursday, Oct 8", card.rows[0].status)
    }

    @Test
    fun lookBackFindsTheGameOnTheFourthDayBackAndStopsThere() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|20261008" to nflDefault))
        val card = Scores.answer("cowboys score", now, tz, espn.fetch)
        assertEquals(SportsState.Scores, card?.state)
        assertEquals(listOf("football/nfl|20261012", "football/nfl|20261011", "football/nfl|",
            "football/nfl|20261010", "football/nfl|20261009", "football/nfl|20261008"), espn.calls)
        assertEquals("Final, Thursday, Oct 8", card?.rows?.first()?.status)
    }

    @Test
    fun leagueWithNoGameTodayOrYesterdayShowsTheLatestDayOnTheCurrentBoard() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|" to nflDefault))
        val card = Scores.answer("nfl scores", now, tz, espn.fetch)
        assertEquals(1, card?.rows?.size)
        assertEquals("Final, Sunday, Oct 11", card?.rows?.first()?.status)
    }

    @Test
    fun mostRecentGameIsTheLatestFinalThenInProgressThenNextScheduled() {
        fun ev(state: String, date: String, name: String) = event("""{"date":"$date","status":{"type":{"state":"$state"}},
            "competitions":[{"competitors":[{"homeAway":"home","team":{"displayName":"Dallas Cowboys","shortDisplayName":"Cowboys","name":"Cowboys"}},
            {"homeAway":"away","team":{"displayName":"$name","shortDisplayName":"$name","name":"$name"}}]}]}""")
        fun dateOf(hit: Pair<JsonObject, JsonObject>?) = hit?.first?.get("date")?.toString()
        val keys = setOf("cowboys", "dallas cowboys")
        val finals = listOf(ev("post", "2026-09-27T17:00Z", "Eagles"), ev("post", "2026-10-09T00:15Z", "Bucs"), ev("pre", "2026-10-20T17:00Z", "Giants"))
        assertEquals("\"2026-10-09T00:15Z\"", dateOf(sportsRecent(finals, keys)))
        val live = listOf(ev("in", "2026-10-12T17:00Z", "Giants"), ev("pre", "2026-10-20T17:00Z", "Bears"))
        assertEquals("\"2026-10-12T17:00Z\"", dateOf(sportsRecent(live, keys)))
        val next = listOf(ev("pre", "2026-10-20T17:00Z", "Bears"), ev("pre", "2026-10-15T17:00Z", "Giants"))
        assertEquals("\"2026-10-15T17:00Z\"", dateOf(sportsRecent(next, keys)))
        assertNull(sportsRecent(listOf(ev("pre", "2026-10-20T17:00Z", "Bears")), setOf("jets")))
    }

    @Test
    fun failedRequestIsTheUnavailableStateNeverNoGame() = runBlockingTest {
        val espn = Espn(mapOf("basketball/nba|20261012" to failure, "basketball/nba|20261011" to failure))
        val card = Scores.answer("lakers score", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(SportsState.Unavailable, card.state)
        assertNull(card.asOf)
    }

    @Test
    fun oneDayFailedAndTheOtherEmptyIsStillUnavailable() = runBlockingTest {
        val espn = Espn(mapOf("basketball/nba|20261011" to failure))
        val card = Scores.answer("lakers score", now, tz, espn.fetch)
        assertEquals(SportsState.Unavailable, card?.state)
    }

    @Test
    fun leagueScoresListTodaysGamesOneRowEach() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|20261012" to nfl0812))
        val card = Scores.answer("nfl scores", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals("NFL scores", card.title)
        assertEquals(1, card.rows.size)
        assertEquals(listOf("football/nfl|20261012"), espn.calls)
    }

    @Test
    fun leagueScoresWithNothingOnEitherDaySaysSo() = runBlockingTest {
        val espn = Espn(emptyMap())
        val card = Scores.answer("nba scores", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals(SportsState.NoGame, card.state)
        assertEquals("No NBA games in the last week", card.noGameLine())
    }

    @Test
    fun scoreboardIsTheOnlySourceAndTheAsOfLineIsTheFetchTime() = runBlockingTest {
        val espn = Espn(mapOf("football/nfl|20261011" to nfl0811))
        val card = Scores.answer("jaguars score", now, tz, espn.fetch)
        assertNotNull(card)
        assertEquals("Oct 12, 1:00 pm", Freshness(now, false).label(tz))
        assertTrue(espn.calls.all { it.contains("|") })
    }

    private fun nflEvent(body: String, index: Int): JsonObject =
        Json.parseToJsonElement(body).jsonObject["events"]!!.jsonArray[index].jsonObject
}

private const val SPORTS_FAILURE = "\u0000fail"

private fun JsonObject.competitors(): List<JsonObject> =
    (this["competitions"]!!.jsonArray[0].jsonObject["competitors"]!!.jsonArray).map { it.jsonObject }
