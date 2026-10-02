package com.nulljosh.nimble

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(history: SearchHistory, modifier: Modifier = Modifier) {
    val client = remember { AnswerClient() }
    val scope = rememberCoroutineScope()

    var theme by remember { mutableStateOf(NimbleTheme.Yellow) }
    var query by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf<Answer?>(null) }
    var loading by remember { mutableStateOf(false) }
    var recent by remember { mutableStateOf(history.list()) }
    val placeholder = remember { QueryEngine.randomSuggestion() }

    // Only a real answer is worth remembering; a miss is not.
    fun record(q: String, a: Answer) {
        if (a is Answer.Miss) return
        history.add(q)
        recent = history.list()
    }

    fun submit(text: String = query) {
        val q = text.trim()
        if (q.isEmpty()) return
        query = q
        // Math resolves synchronously and offline; no spinner for something instant.
        val offline = QueryEngine.evaluateMath(q)
        if (offline != null) {
            answer = Answer.Math(offline).also { record(q, it) }
            return
        }
        loading = true
        scope.launch {
            val a = client.query(q)
            answer = a
            loading = false
            record(q, a)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(theme.background)
            .padding(24.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Nimble",
                color = theme.text,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
            ThemeSwatches(selected = theme, onSelect = { theme = it })
        }

        Spacer(Modifier.height(20.dp))

        TextField(
            value = query,
            onValueChange = {
                query = it
                if (it.isBlank()) answer = null
            },
            placeholder = { Text(placeholder, color = theme.muted, fontSize = 18.sp) },
            singleLine = true,
            textStyle = LocalTextStyle.current.copy(fontSize = 20.sp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { submit() }),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedTextColor = theme.text,
                unfocusedTextColor = theme.text,
                cursorColor = theme.accent,
                focusedIndicatorColor = theme.accent,
                unfocusedIndicatorColor = theme.muted,
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(24.dp))

        Box(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
            when {
                loading -> CircularProgressIndicator(color = theme.accent, modifier = Modifier.size(28.dp))
                answer != null -> answer?.let { ResultCard(it, theme) }
                query.isBlank() && recent.isNotEmpty() -> RecentList(
                    entries = recent.take(8),
                    theme = theme,
                    onPick = { submit(it) },
                    onClear = {
                        history.clear()
                        recent = emptyList()
                    },
                )
            }
        }

        Text(
            "Math runs offline.",
            color = theme.muted,
            fontSize = 12.sp,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        )
    }
}

@Composable
private fun RecentList(
    entries: List<HistoryEntry>,
    theme: NimbleTheme,
    onPick: (String) -> Unit,
    onClear: () -> Unit,
) {
    Column(Modifier.widthIn(max = 640.dp).fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "RECENT",
                color = theme.accent,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                "Clear",
                color = theme.muted,
                fontSize = 12.sp,
                modifier = Modifier.clickable(onClick = onClear).padding(vertical = 4.dp)
            )
        }
        for (e in entries) {
            Text(
                e.q,
                color = theme.text,
                fontSize = 16.sp,
                maxLines = 1,
                modifier = Modifier.fillMaxWidth().clickable { onPick(e.q) }.padding(vertical = 10.dp)
            )
        }
    }
}

@Composable
private fun ThemeSwatches(selected: NimbleTheme, onSelect: (NimbleTheme) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (t in NimbleTheme.entries) {
            Box(
                Modifier
                    .size(18.dp)
                    .background(t.accent, CircleShape)
                    .border(
                        width = if (t == selected) 2.dp else 1.dp,
                        color = if (t == selected) selected.text else selected.muted,
                        shape = CircleShape
                    )
                    .clickable { onSelect(t) }
            )
        }
    }
}

@Composable
private fun ResultCard(answer: Answer, theme: NimbleTheme) {
    Column(Modifier.widthIn(max = 640.dp)) {
        when (answer) {
            is Answer.Math -> Text(
                answer.value,
                color = theme.accent,
                fontSize = 44.sp,
                fontWeight = FontWeight.Bold
            )

            is Answer.Text -> {
                // Whole answer opens its source; AI answers have none, so fall back to a web search.
                val uriHandler = LocalUriHandler.current
                Column(Modifier.clickable { answer.sourceUrl?.let(uriHandler::openUri) }) {
                    answer.heading?.let {
                        Text(it, color = theme.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                    }
                    Text(answer.body, color = theme.text, fontSize = 16.sp, textDecoration = TextDecoration.Underline)
                    Spacer(Modifier.height(12.dp))
                    Text("Source: ${answer.source}", color = theme.muted, fontSize = 12.sp)
                }
            }

            is Answer.Miss -> Text(answer.message, color = theme.muted, fontSize = 16.sp)
        }
    }
}
