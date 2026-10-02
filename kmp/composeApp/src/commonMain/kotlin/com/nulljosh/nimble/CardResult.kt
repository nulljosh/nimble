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
        Text(
            buildAnnotatedString {
                append(card.big)
                if (card.unit.isNotEmpty()) {
                    withStyle(SpanStyle(fontSize = 13.sp, color = theme.accent)) {
                        // The degree sign hugs the number; every other unit gets a space.
                        if (!card.unit.startsWith("°")) append(" ")
                        append(card.unit)
                    }
                }
            },
            color = theme.text,
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Text(card.sub, color = theme.muted, fontSize = 15.sp)
        Spacer(Modifier.height(12.dp))
        Text("Source: ${card.source}", color = theme.muted, fontSize = 11.sp)
    }
}
