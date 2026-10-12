package com.nulljosh.nimble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Weather, time, currency and etymology as a card: one big number, its unit in the accent
 * colour, one quiet line, the source. The whole card opens the source page.
 */
@Composable
fun CardResult(card: Card, theme: NimbleTheme, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    Column(
        modifier
            .widthIn(max = 640.dp)
            .clickable(onClickLabel = "Open ${card.source}") { uriHandler.openUri(card.url) }
    ) {
        // One headline line, "11 °C": the unit sits after a space and never wraps onto its own line.
        Text(
            buildAnnotatedString {
                append(card.big)
                if (card.unit.isNotEmpty()) {
                    withStyle(SpanStyle(fontSize = 13.sp, color = theme.accent)) {
                        append(" ")
                        append(card.unit)
                    }
                }
            },
            color = theme.text,
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        Text(card.sub, color = theme.muted, fontSize = 15.sp)
        card.asOf?.let {
            Spacer(Modifier.height(12.dp))
            AsOfLine(it, theme)
        }
        Spacer(Modifier.height(12.dp))
        Text("Source: ${card.source}", color = theme.muted, fontSize = 11.sp)
    }
}

/** The quiet freshness line: "as of Oct 12, 3:41 pm", or "as of Oct 9" for a daily value. Same left edge as the source row. */
@Composable
fun AsOfLine(asOf: Freshness, theme: NimbleTheme, modifier: Modifier = Modifier) {
    Text("as of ${asOf.label()}", color = theme.muted, fontSize = 13.sp, modifier = modifier)
}
