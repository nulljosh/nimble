package com.nulljosh.nimble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * "Sources disagree": both answers, each with the model that gave it, and no pick. No photo and no
 * "powered by" line, as on the web. Each answer reads as one item (text, then model) for screen readers.
 */
@Composable
fun DisagreeResult(answer: Answer.Disagree, theme: NimbleTheme, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    Column(modifier) {
        Text(
            "SOURCES DISAGREE",
            color = theme.muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
        )
        Spacer(Modifier.height(12.dp))
        answer.alts.forEachIndexed { index, alt ->
            if (index > 0) Spacer(Modifier.height(16.dp))
            Column(Modifier.semantics(mergeDescendants = true) {}) {
                Text(alt.answer, color = theme.text, fontSize = 20.sp)
                Spacer(Modifier.height(4.dp))
                Text(alt.model, color = theme.muted, fontSize = 13.sp)
            }
        }
        if (answer.sources.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                answer.sources.forEachIndexed { index, source ->
                    if (index > 0) Text("·", color = theme.muted, fontSize = 13.sp)
                    Box(
                        Modifier
                            .defaultMinSize(minHeight = 48.dp)
                            .clickable(onClickLabel = source.name) { uriHandler.openUri(source.url) },
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(source.name, color = theme.accent, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}
