package com.nulljosh.nimble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A team or league's score: the title, each game as the score with the winner in bold weight, the status in
 * words, the as-of line and the source. A game not found names the days checked; a failed request is the calm
 * "Scores unavailable right now". The winner is marked by weight and the words, not by colour alone.
 */
@Composable
fun SportsResult(sports: Answer.Sports, theme: NimbleTheme, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    Column(modifier.widthIn(max = 640.dp).padding(24.dp)) {
        Text(sports.title, color = theme.muted, fontSize = 15.sp)
        Spacer(Modifier.height(4.dp))
        when (sports.state) {
            SportsState.Unavailable -> Text("Scores unavailable right now", color = theme.muted, fontSize = 15.sp)
            SportsState.NoGame -> {
                Text(sports.noGameLine(), color = theme.muted, fontSize = 15.sp)
                sports.asOf?.let {
                    Spacer(Modifier.height(12.dp))
                    AsOfLine(it, theme)
                }
            }
            SportsState.Scores -> {
                sports.rows.forEachIndexed { i, game ->
                    if (i > 0) Spacer(Modifier.height(12.dp))
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .clickable(onClickLabel = "Open ESPN scoreboard") { uriHandler.openUri(sports.url) }
                    ) {
                        Text(scoreLine(game), color = theme.text, fontSize = 20.sp)
                        Text(game.status, color = theme.muted, fontSize = 15.sp)
                    }
                }
                sports.asOf?.let {
                    Spacer(Modifier.height(12.dp))
                    AsOfLine(it, theme)
                }
                Spacer(Modifier.height(12.dp))
                Text("Source: ESPN", color = theme.muted, fontSize = 11.sp)
            }
        }
    }
}

// "Lakers 112, Warriors 104" with the winner in bold; "Bills vs Rams" before kickoff, with no score.
private fun scoreLine(game: SportsGame): AnnotatedString = buildAnnotatedString {
    if (game.state == "pre" && game.teams.size == 2) {
        append(game.teams[0].name)
        append(" vs ")
        append(game.teams[1].name)
        return@buildAnnotatedString
    }
    game.teams.forEachIndexed { i, team ->
        if (i > 0) append(", ")
        val text = if (team.score.isNotEmpty()) "${team.name} ${team.score}" else team.name
        if (team.winner) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(text) } else append(text)
    }
}
