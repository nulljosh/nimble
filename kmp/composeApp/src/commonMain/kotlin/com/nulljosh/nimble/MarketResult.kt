package com.nulljosh.nimble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A price or rate: the title, the big number, the change in words ("Up 0.56% in the last 24 hours"), the
 * freshness line, then the source. A failed quote is the calm state with no number. The whole card opens the
 * source, and only when there is a price to open it for, at a 48dp minimum touch target.
 */
@Composable
fun MarketResult(market: Answer.Market, theme: NimbleTheme, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    val big = market.big
    val priced = big != null
    Column(
        modifier
            .widthIn(max = 640.dp)
            .defaultMinSize(minHeight = 48.dp)
            .then(if (priced) Modifier.clickable(onClickLabel = tr("Open {s}", "s" to market.source)) { uriHandler.openUri(market.url) } else Modifier)
    ) {
        Text(market.title, color = theme.muted, fontSize = 15.sp)
        Spacer(Modifier.height(4.dp))
        if (big == null) {
            Text(tr("Quote unavailable right now"), color = theme.muted, fontSize = 15.sp)
        } else {
            Text(
                big,
                color = theme.text,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
            )
            market.change?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, color = theme.muted, fontSize = 15.sp)
            }
        }
        market.asOf?.let {
            Spacer(Modifier.height(12.dp))
            AsOfLine(it, theme)
        }
        Spacer(Modifier.height(12.dp))
        Text(tr("Source: {s}", "s" to market.source), color = theme.muted, fontSize = 11.sp)
    }
}
