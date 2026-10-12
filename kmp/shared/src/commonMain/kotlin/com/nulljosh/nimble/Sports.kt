package com.nulljosh.nimble

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Sports scores from ESPN's keyless scoreboard. Same detection, day order, rows and states as `sports()` in
 * docs/engine.js and Sources/Models/QueryEngine+Sports.swift, so a question means the same thing on every
 * platform. A score is never guessed and the AI never runs for one. Tested offline in SportsTest.
 */

/** The league a sports question names, or a team's name with the leagues it plays in. */
internal sealed class SportsAsk {
    data class ByLeague(val key: String, val lastNight: Boolean) : SportsAsk()
    data class ByTeam(val team: String, val teams: Map<String, Set<String>>, val lastNight: Boolean) : SportsAsk()
}

/** One side of a game: the name, the score as ESPN gives it ("" before kickoff), and whether it won. */
data class SportsTeam(val name: String, val score: String, val winner: Boolean)

/** One game as a row: the teams (ours first, or away first), the state from ESPN, and the status in words. */
data class SportsGame(val teams: List<SportsTeam>, val state: String?, val status: String)

/** Rows: the games. NoGame: both days were checked and neither had one. Unavailable: a request failed. */
enum class SportsState { Scores, NoGame, Unavailable }

/** Scoreboard of one league: the ESPN path, the display name, the page to open, and the period unit (if any). */
internal class League(val path: String, val name: String, val url: String, val unit: String?, val periods: Int)

private val LEAGUES: Map<String, League> = mapOf(
    "nba" to League("basketball/nba", "NBA", "https://www.espn.com/nba/scoreboard", "quarter", 4),
    "nfl" to League("football/nfl", "NFL", "https://www.espn.com/nfl/scoreboard", "quarter", 4),
    "mlb" to League("baseball/mlb", "MLB", "https://www.espn.com/mlb/scoreboard", null, 0),
    "nhl" to League("hockey/nhl", "NHL", "https://www.espn.com/nhl/scoreboard", "period", 3),
    "epl" to League("soccer/eng.1", "Premier League", "https://www.espn.com/soccer/league/_/name/eng.1", null, 0),
    "mls" to League("soccer/usa.1", "MLS", "https://www.espn.com/soccer/league/_/name/usa.1", null, 0),
)

// Teams split by ";". A "|" lists the names a fan types (the first is the ESPN display name). Without one,
// the big four also answer to the last word ("Lakers"); soccer names are listed in full.
private val TEAMS: Map<String, String> = mapOf(
    "nba" to "Atlanta Hawks;Boston Celtics;Brooklyn Nets;Charlotte Hornets;Chicago Bulls;Cleveland Cavaliers;Dallas Mavericks;Denver Nuggets;Detroit Pistons;Golden State Warriors;Houston Rockets;Indiana Pacers;LA Clippers|Clippers;Los Angeles Lakers;Memphis Grizzlies;Miami Heat;Milwaukee Bucks;Minnesota Timberwolves;New Orleans Pelicans;New York Knicks;Oklahoma City Thunder;Orlando Magic;Philadelphia 76ers|76ers|Sixers;Phoenix Suns;Portland Trail Blazers|Trail Blazers;Sacramento Kings;San Antonio Spurs;Toronto Raptors;Utah Jazz;Washington Wizards",
    "nfl" to "Arizona Cardinals;Atlanta Falcons;Baltimore Ravens;Buffalo Bills;Carolina Panthers;Chicago Bears;Cincinnati Bengals;Cleveland Browns;Dallas Cowboys;Denver Broncos;Detroit Lions;Green Bay Packers;Houston Texans;Indianapolis Colts;Jacksonville Jaguars;Kansas City Chiefs;Las Vegas Raiders;Los Angeles Chargers;Los Angeles Rams;Miami Dolphins;Minnesota Vikings;New England Patriots;New Orleans Saints;New York Giants;New York Jets;Philadelphia Eagles;Pittsburgh Steelers;San Francisco 49ers;Seattle Seahawks;Tampa Bay Buccaneers;Tennessee Titans;Washington Commanders",
    "mlb" to "Arizona Diamondbacks;Atlanta Braves;Baltimore Orioles;Boston Red Sox|Red Sox;Chicago Cubs;Chicago White Sox|White Sox;Cincinnati Reds;Cleveland Guardians;Colorado Rockies;Detroit Tigers;Houston Astros;Kansas City Royals;Los Angeles Angels;Los Angeles Dodgers;Miami Marlins;Milwaukee Brewers;Minnesota Twins;New York Mets;New York Yankees;Athletics;Philadelphia Phillies;Pittsburgh Pirates;San Diego Padres;San Francisco Giants;Seattle Mariners;St. Louis Cardinals;Tampa Bay Rays;Texas Rangers;Toronto Blue Jays|Blue Jays;Washington Nationals",
    "nhl" to "Anaheim Ducks;Boston Bruins;Buffalo Sabres;Calgary Flames;Carolina Hurricanes;Chicago Blackhawks;Colorado Avalanche;Columbus Blue Jackets|Blue Jackets;Dallas Stars;Detroit Red Wings|Red Wings;Edmonton Oilers;Florida Panthers;Los Angeles Kings;Minnesota Wild;Montreal Canadiens;Nashville Predators;New Jersey Devils;New York Islanders;New York Rangers;Ottawa Senators;Philadelphia Flyers;Pittsburgh Penguins;San Jose Sharks;Seattle Kraken;St. Louis Blues;Tampa Bay Lightning;Toronto Maple Leafs|Maple Leafs;Utah Mammoth|Utah Hockey Club|Mammoth;Vancouver Canucks;Vegas Golden Knights|Golden Knights;Washington Capitals;Winnipeg Jets",
    "epl" to "Arsenal;Aston Villa|Villa;AFC Bournemouth|Bournemouth;Brentford;Brighton & Hove Albion|Brighton;Burnley;Chelsea;Crystal Palace|Palace;Everton;Fulham;Leeds United|Leeds;Liverpool;Manchester City|Man City;Manchester United|Man United|Man Utd;Newcastle United|Newcastle;Nottingham Forest|Nottingham;Sunderland;Tottenham Hotspur|Tottenham|Spurs;West Ham United|West Ham;Wolverhampton Wanderers|Wolves",
    "mls" to "Atlanta United FC|Atlanta United;Austin FC;CF Montréal|CF Montreal|Montreal;Charlotte FC;Chicago Fire FC|Chicago Fire;FC Cincinnati|Cincinnati;Colorado Rapids|Rapids;Columbus Crew|Columbus Crew SC;D.C. United|DC United;FC Dallas|Dallas FC;Houston Dynamo FC|Houston Dynamo;Inter Miami CF|Inter Miami;LA Galaxy|Galaxy;Los Angeles FC|LAFC;Minnesota United FC|Minnesota United;Nashville SC|Nashville;New England Revolution|Revolution;New York City FC|NYCFC;New York Red Bulls|Red Bulls;Orlando City SC|Orlando City;Philadelphia Union;Portland Timbers|Timbers;Real Salt Lake|Salt Lake;San Diego FC;San Jose Earthquakes|Earthquakes;Seattle Sounders FC|Sounders|Seattle Sounders;Sporting Kansas City|Sporting KC;St. Louis City SC|St. Louis City;Toronto FC;Vancouver Whitecaps FC|Whitecaps|Vancouver Whitecaps",
)

// Nicknames that are also everyday words: these match only with a score word, never alone.
private val COMMON: Set<String> = "heat magic jazz thunder wild kings nets suns spurs warriors hawks bulls bears giants cardinals panthers rangers jets stars rockets nuggets pelicans clippers wizards hornets pistons titans chiefs chargers raiders packers vikings lions cowboys eagles falcons saints rams dolphins patriots colts broncos bills ravens steelers texans jaguars browns bengals seahawks commanders buccaneers lightning flames senators bruins blues ducks sharks devils hurricanes capitals islanders flyers avalanche predators kraken coyotes canadiens sabres athletics guardians orioles royals rays tigers twins angels reds cubs mets braves astros padres nationals mariners pirates phillies yankees brewers rockies marlins diamondbacks dodgers wolves villa palace crew union revolution timbers galaxy rapids dynamo sounders whitecaps earthquakes mammoth blazers sixers raptors cavaliers bucks grizzlies pacers".split(" ").toSet()

// A score word. "win" and "game" count; "history" and "coach" do not, so they never reach a scoreboard.
private val intentRe = Regex("""\b(scores?|scored|won|wins?|winner|lose|loses|lost|loss|beat|beats|beaten|games?|results?|final|finals|playing|match|tonight|last night)\b""")
// Questions about the future, opinions, rosters and news are never a score lookup.
private val negRe = Regex("""\b(will|would|should|could|might|why|how many|how much|how to|how do|odds|predict\w*|bet|best|worst|trade|traded|draft|drafted|sign|signed|coach|roster|news|history|rumou?rs?)\b""")
private val leagueRe = Regex("""^(?:(?:today's|todays|latest|recent|last night's)\s+)?(nba|nfl|mlb|nhl|mls|epl|premier league)\s+(?:scores?|results?|games?)$""")
private val trailingPunct = Regex("""[?!.]+$""")

// Accented letters that appear in team names, folded to plain ASCII (the web does this with NFD).
private fun foldChar(c: Char): Char = when (c) {
    'á', 'à', 'â', 'ä', 'ã', 'å', 'Á', 'À', 'Â', 'Ä', 'Ã', 'Å' -> 'a'
    'é', 'è', 'ê', 'ë', 'É', 'È', 'Ê', 'Ë' -> 'e'
    'í', 'ì', 'î', 'ï', 'Í', 'Ì', 'Î', 'Ï' -> 'i'
    'ó', 'ò', 'ô', 'ö', 'õ', 'Ó', 'Ò', 'Ô', 'Ö', 'Õ' -> 'o'
    'ú', 'ù', 'û', 'ü', 'Ú', 'Ù', 'Û', 'Ü' -> 'u'
    'ç', 'Ç' -> 'c'
    'ñ', 'Ñ' -> 'n'
    else -> c
}

/** Lowercase, accents folded, curly apostrophes straight, spaces collapsed. The key every alias is compared by. */
internal fun sportsFold(s: String): String =
    s.map(::foldChar).joinToString("").lowercase()
        .replace('‘', '\'').replace('’', '\'')
        .replace(Regex("\\s+"), " ").trim()

private class TeamEntry(val lg: String, val keys: Set<String>)

// alias -> the leagues and names it stands for. A bare big-four nickname is listed without its city too.
private val index: Map<String, List<TeamEntry>> = run {
    val idx = LinkedHashMap<String, MutableList<TeamEntry>>()
    for ((lg, list) in TEAMS) for (raw in list.split(";")) {
        val parts = raw.split("|").map { it.trim() }
        val names = if (parts.size > 1 || lg !in setOf("nba", "nfl", "mlb", "nhl")) parts
            else listOf(parts[0], parts[0].split(" ").last())
        val keys = names.map(::sportsFold).distinct()
        for (k in keys) idx.getOrPut(k) { mutableListOf() }.add(TeamEntry(lg, keys.toSet()))
    }
    idx
}

// One regex over every alias, longest first, so "los angeles lakers" wins over "lakers".
private val aliasRe = Regex(
    "(?:^|[^a-z0-9])(" + index.keys.sortedByDescending { it.length }.joinToString("|") { Regex.escape(it) } + ")(?![a-z0-9])"
)

/** The sports question in a query, or null when it is not one. Math, markets and ordinary questions are null. */
internal fun sportsAsk(query: String): SportsAsk? {
    val q = sportsFold(query).replace(trailingPunct, "").trim()
    leagueRe.find(q)?.let { m ->
        val key = m.groupValues[1].let { if (it == "premier league") "epl" else it }
        return SportsAsk.ByLeague(key, q.contains("last night"))
    }
    if (negRe.containsMatchIn(q)) return null
    val m = aliasRe.find(q) ?: return null
    val team = m.groupValues[1]
    val intent = intentRe.containsMatchIn(q)
    if (!intent && q != team && q != "the $team") return null   // a bare name, or "the" and the name, and nothing else
    if (!intent && team in COMMON) return null
    val teams = LinkedHashMap<String, MutableSet<String>>()
    for (e in index[team].orEmpty()) teams.getOrPut(e.lg) { mutableSetOf() }.addAll(e.keys)
    return SportsAsk.ByTeam(team, teams, q.contains("last night"))
}

/** Clock pieces of an instant in a zone (the device zone when null), via java.time on each platform. */
internal expect fun zoneClock(epochMillis: Long, zoneId: String?, pattern: String): String

private val EMPTY = JsonObject(emptyMap())
private val json = Json { ignoreUnknownKeys = true; isLenient = true }

private fun JsonElement?.scalar(): String? = (this as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content
private fun JsonObject.str(k: String): String? = this[k].scalar()?.takeIf { it.isNotEmpty() }
private fun JsonObject.obj(k: String): JsonObject? = this[k] as? JsonObject
private fun JsonObject.competitors(): List<JsonObject> =
    ((this["competitions"] as? JsonArray)?.firstOrNull() as? JsonObject)?.get("competitors")
        ?.let { it as? JsonArray }?.mapNotNull { it as? JsonObject } ?: emptyList()

private fun ordinal(n: Int): String = n.toString() + when {
    n % 10 == 1 && n % 100 != 11 -> "st"
    n % 10 == 2 && n % 100 != 12 -> "nd"
    n % 10 == 3 && n % 100 != 13 -> "rd"
    else -> "th"
}

/** "7:30 pm" today, "Oct 13, 7:30 pm" on another day. The clock reads in the zone asked for. */
internal fun kickoffLabel(iso: String?, now: Long, zoneId: String?): String {
    val d = isoMillis(iso ?: return "") ?: return ""
    val time = zoneClock(d, zoneId, "h:mm a").replace(Regex("\\s+"), " ").replace(" AM", " am").replace(" PM", " pm")
    if (zoneClock(d, zoneId, "yyyy-MM-dd") == zoneClock(now, zoneId, "yyyy-MM-dd")) return time
    return zoneClock(d, zoneId, "MMM d") + ", " + time
}

// ESPN's ISO times ("2026-10-13T00:15Z", with optional seconds and a numeric offset). Anything else is no time.
private val isoRe = Regex("""^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$""")
internal fun isoMillis(iso: String): Long? {
    val m = isoRe.find(iso.trim()) ?: return null
    val day = utcDayMillis(m.groupValues[1]) ?: return null
    var t = day + m.groupValues[2].toLong() * 3_600_000L + m.groupValues[3].toLong() * 60_000L + (m.groupValues[4].ifEmpty { "0" }).toLong() * 1_000L
    val zone = m.groupValues[5]
    if (zone.isNotEmpty() && zone != "Z") {
        val sign = if (zone[0] == '-') -1 else 1
        val digits = zone.substring(1).replace(":", "")
        t -= sign * (digits.substring(0, 2).toLong() * 3_600_000L + digits.substring(2).toLong() * 60_000L)
    }
    return t
}

/** "Final", "Final/OT", "3rd quarter 4:12", "Scheduled for 7:30 pm". Soccer and baseball use ESPN's own short text. */
internal fun sportsStatus(ev: JsonObject, lg: String, now: Long, zoneId: String?): String {
    val st = ev.obj("status") ?: EMPTY
    val t = st.obj("type") ?: EMPTY
    val state = t.str("state")
    val L = LEAGUES[lg]
    if (state == "post") return t.str("detail") ?: t.str("shortDetail") ?: "Final"
    if (state == "pre") return "Scheduled for " + kickoffLabel(ev.str("date"), now, zoneId)
    if (t.str("name") == "STATUS_HALFTIME") return "Halftime"
    val period = (st["period"] as? JsonPrimitive)?.intOrNull
    val clock = st.str("displayClock")
    if (state == "in" && L?.unit != null && period != null && period >= 1 && period <= L.periods && clock != null) {
        return "${ordinal(period)} ${L.unit} $clock"
    }
    return t.str("shortDetail") ?: t.str("detail") ?: "In progress"
}

/** One game as a row: our team first, the winner marked, a tie said in words. ESPN gives no score before kickoff.
 *  dated: a final found by the look-back says its day ("Final, Thursday, Oct 8"). */
fun gameRow(ev: JsonObject, ours: JsonObject?, lg: String, now: Long, zoneId: String?, dated: Boolean = false): SportsGame {
    val comps = ev.competitors()
    val order = if (ours != null) listOf(ours) + comps.filter { it !== ours }
        else comps.sortedBy { if (it.str("homeAway") == "away") 0 else 1 }
    val state = (ev.obj("status")?.obj("type") ?: EMPTY).str("state")
    val teams = order.map { c ->
        val team = c.obj("team")
        SportsTeam(
            name = team?.str("shortDisplayName") ?: team?.str("name") ?: "",
            score = if (state == "pre") "" else c["score"].scalar() ?: "",
            winner = c["winner"].scalar() == "true",
        )
    }
    val tied = state == "post" && teams.none { it.winner }
    val day = if (dated && state == "post") ", " + (isoMillis(ev.str("date") ?: "")?.let { zoneClock(it, zoneId, "EEEE, MMM d") } ?: "") else ""
    return SportsGame(teams, state, sportsStatus(ev, lg, now, zoneId) + day + if (tied) ", tied" else "")
}

// Every event where the team plays, with the team's own side, found by any of its names.
private fun sportsHits(events: List<JsonObject>, keys: Set<String>): List<Pair<JsonObject, JsonObject>> = events.mapNotNull { ev ->
    val ours = ev.competitors().firstOrNull { c ->
        val t = c.obj("team")
        listOf(t?.str("displayName"), t?.str("shortDisplayName"), t?.str("name")).any { n -> n != null && sportsFold(n) in keys }
    }
    ours?.let { ev to it }
}

// The event where the team plays, found by any of its names.
private fun sportsFind(events: List<JsonObject>, keys: Set<String>): Pair<JsonObject, JsonObject>? = sportsHits(events, keys).firstOrNull()

private fun sportsState(ev: JsonObject): String? = ev.obj("status")?.obj("type")?.str("state")
private fun sportsTime(ev: JsonObject): Long = isoMillis(ev.str("date") ?: "") ?: 0L

// The team's most recent game on one board: the latest Final, else one in progress, else the next scheduled.
internal fun sportsRecent(events: List<JsonObject>, keys: Set<String>): Pair<JsonObject, JsonObject>? {
    val hits = sportsHits(events, keys)
    hits.filter { sportsState(it.first) == "post" }.maxByOrNull { sportsTime(it.first) }?.let { return it }
    hits.firstOrNull { sportsState(it.first) == "in" }?.let { return it }
    return hits.filter { sportsState(it.first) == "pre" }.minByOrNull { sportsTime(it.first) }
}

// A league's most recent day on its current scoreboard: the latest Final's day, else a game in progress, else the next
// scheduled day. Returns that day's games (possibly none).
private fun recentDay(events: List<JsonObject>, zoneId: String?): List<JsonObject> {
    val pick = events.filter { sportsState(it) == "post" }.maxByOrNull { sportsTime(it) }
        ?: events.firstOrNull { sportsState(it) == "in" }
        ?: events.filter { sportsState(it) == "pre" }.minByOrNull { sportsTime(it) }
        ?: return emptyList()
    val day = zoneClock(sportsTime(pick), zoneId, "yyyyMMdd")
    return events.filter { zoneClock(sportsTime(it), zoneId, "yyyyMMdd") == day }
}

/** "lakers" -> "Lakers", "man city" -> "Man City": capitalise each word, the way the web title does. */
internal fun titleCase(s: String): String {
    val out = StringBuilder()
    var prevWord = false
    for (c in s) {
        val word = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '_'
        out.append(if (word && !prevWord && c in 'a'..'z') c.uppercaseChar() else c)
        prevWord = word
    }
    return out.toString()
}

/** The calm line when no game was found in the last seven days. Used by the Compose card and the tests. */
fun Answer.Sports.noGameLine(): String = when {
    league != null -> "No $league games in the last week"
    else -> "No game found for the $title in the last week"
}

/** The sports card for a query, or null when the query is not about sports. The order is fixed: today, then yesterday
 *  ("last night" is yesterday only), by the day's board; then the current scoreboard with no date (the most recent game:
 *  Final, else in progress, else next); then each day back to seven days ago. A failed request with no game found is
 *  Unavailable, never NoGame. [fetch] returns a 200 body or null (a failure). No other host is ever asked. */
object Scores {

    const val TIMEOUT_MS = 4_000L
    private const val DAY_MS = 86_400_000L

    suspend fun answer(
        query: String,
        now: Long = Freshness.now().epochMillis,
        zoneId: String? = null,
        fetch: suspend (String) -> String?,
    ): Answer.Sports? {
        val ask = sportsAsk(query) ?: return null
        val lastNight = when (ask) { is SportsAsk.ByLeague -> ask.lastNight; is SportsAsk.ByTeam -> ask.lastNight }
        val back = if (lastNight) listOf(1) else listOf(0, 1)
        val asOf = Freshness(now, false)
        var failed = false
        return when (ask) {
            is SportsAsk.ByLeague -> {
                val L = LEAGUES.getValue(ask.key)
                fun show(evs: List<JsonObject>, dated: Boolean) = Answer.Sports(
                    "${L.name} scores", L.name, evs.take(8).map { gameRow(it, null, ask.key, now, zoneId, dated) },
                    SportsState.Scores, lastNight, L.url, asOf,
                )
                for (b in back) {
                    val ev = board(ask.key, day(now, b, zoneId), fetch)
                    if (ev == null) { failed = true; continue }
                    if (ev.isNotEmpty()) return show(ev, false)
                }
                val current = board(ask.key, null, fetch)
                if (current == null) failed = true
                else recentDay(current, zoneId).takeIf { it.isNotEmpty() }?.let { return show(it, true) }
                for (b in 2..7) {
                    val ev = board(ask.key, day(now, b, zoneId), fetch)
                    if (ev == null) { failed = true; continue }
                    if (ev.isNotEmpty()) return show(ev, true)
                }
                if (failed) Answer.Sports("${L.name} scores", L.name, emptyList(), SportsState.Unavailable, lastNight, L.url, null)
                else Answer.Sports("${L.name} scores", L.name, emptyList(), SportsState.NoGame, lastNight, L.url, asOf)
            }
            is SportsAsk.ByTeam -> {
                val title = titleCase(ask.team)
                fun found(lg: String, hit: Pair<JsonObject, JsonObject>, dated: Boolean) = Answer.Sports(
                    title, null, listOf(gameRow(hit.first, hit.second, lg, now, zoneId, dated)),
                    SportsState.Scores, lastNight, LEAGUES.getValue(lg).url, asOf,
                )
                for (b in back) for (lg in ask.teams.keys) {
                    val ev = board(lg, day(now, b, zoneId), fetch)
                    if (ev == null) { failed = true; continue }
                    sportsFind(ev, ask.teams.getValue(lg))?.let { return found(lg, it, false) }
                }
                for (lg in ask.teams.keys) {
                    val ev = board(lg, null, fetch)
                    if (ev == null) { failed = true; continue }
                    sportsRecent(ev, ask.teams.getValue(lg))?.let { return found(lg, it, true) }
                }
                for (b in 2..7) for (lg in ask.teams.keys) {
                    val ev = board(lg, day(now, b, zoneId), fetch)
                    if (ev == null) { failed = true; continue }
                    sportsFind(ev, ask.teams.getValue(lg))?.let { return found(lg, it, true) }
                }
                if (failed) Answer.Sports(title, null, emptyList(), SportsState.Unavailable, lastNight, "https://www.espn.com", null)
                else Answer.Sports(title, null, emptyList(), SportsState.NoGame, lastNight, "https://www.espn.com", asOf)
            }
        }
    }

    private fun day(now: Long, back: Int, zoneId: String?): String = zoneClock(now - back * DAY_MS, zoneId, "yyyyMMdd")

    // One league's events for one day (ymd), or the current scoreboard when ymd is null: a list (possibly empty),
    // or null when the request failed.
    private suspend fun board(lg: String, ymd: String?, fetch: suspend (String) -> String?): List<JsonObject>? {
        val query = if (ymd == null) "" else "?dates=$ymd"
        val body = fetch("https://site.api.espn.com/apis/site/v2/sports/${LEAGUES.getValue(lg).path}/scoreboard$query") ?: return null
        val root = runCatching { json.parseToJsonElement(body) as? JsonObject }.getOrNull() ?: return null
        val events = root["events"] as? JsonArray ?: return null
        return events.mapNotNull { it as? JsonObject }
    }
}
