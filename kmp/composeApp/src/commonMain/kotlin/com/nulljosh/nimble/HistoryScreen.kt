package com.nulljosh.nimble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Every saved question with its answer and age. A tap asks it again; a long press starts a selection, and while
 * anything is selected a tap adds or removes a row. The bar above the list copies or deletes the selection.
 * Touch targets are 48dp or taller.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HistoryScreen(
    entries: List<HistoryEntry>,
    theme: NimbleTheme,
    now: Long,
    onBack: () -> Unit,
    onAsk: (String) -> Unit,
    onCopy: (Set<String>) -> Unit,
    onDelete: (Set<String>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var picked by remember { mutableStateOf(setOf<String>()) }
    val shown = entries.map { it.q }.toSet()
    // Rows that were deleted or cleared elsewhere drop out of the selection.
    val live = picked.filter { it in shown }.toSet()
    if (live != picked) picked = live

    Column(modifier.fillMaxSize().background(theme.background).padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Back",
                color = theme.text,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable(role = Role.Button, onClickLabel = "Back to search", onClick = onBack)
                    .padding(end = 16.dp),
            )
            Text(
                "History",
                color = theme.text,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        if (picked.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(theme.muted.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${picked.size} selected",
                    color = theme.text,
                    fontSize = 14.sp,
                    modifier = Modifier.weight(1f).padding(start = 8.dp),
                )
                BarAction("Copy", theme) { onCopy(picked) }
                BarAction("Delete", theme) {
                    onDelete(picked)
                    picked = emptySet()
                }
                BarAction("Cancel", theme) { picked = emptySet() }
            }
        }

        Spacer(Modifier.height(12.dp))

        if (entries.isEmpty()) {
            Text("No questions yet. Ask one and it lands here.", color = theme.muted, fontSize = 16.sp)
            return@Column
        }

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            for (e in entries) {
                val selected = e.q in picked
                Row(
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 56.dp)
                        .combinedClickable(
                            onClickLabel = if (picked.isEmpty()) "Ask again" else "Select",
                            onLongClickLabel = "Select",
                            onLongClick = { picked = picked + e.q },
                            onClick = {
                                if (picked.isEmpty()) onAsk(e.q)
                                else picked = if (selected) picked - e.q else picked + e.q
                            },
                        )
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    if (picked.isNotEmpty()) {
                        Box(
                            Modifier
                                .size(24.dp)
                                .border(2.dp, if (selected) theme.accent else theme.muted, CircleShape)
                                .background(if (selected) theme.accent else Color.Transparent, CircleShape),
                        )
                        Spacer(Modifier.width(12.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(e.q, color = theme.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
                        e.answer?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(it, color = theme.muted, fontSize = 14.sp, maxLines = 2)
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(relativeAge(e.t, now), color = theme.muted, fontSize = 12.sp)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(theme.muted.copy(alpha = 0.2f)))
            }
        }
    }
}

/** A 48dp text action in the selection bar. */
@Composable
private fun BarAction(label: String, theme: NimbleTheme, onClick: () -> Unit) {
    Box(
        Modifier
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = theme.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}
