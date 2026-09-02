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
fun SearchScreen(modifier: Modifier = Modifier) {
    val client = remember { AnswerClient() }
    val scope = rememberCoroutineScope()

    var theme by remember { mutableStateOf(NimbleTheme.Yellow) }
    var query by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf<Answer?>(null) }
    var loading by remember { mutableStateOf(false) }
    val placeholder = remember { QueryEngine.randomSuggestion() }

    fun submit() {
        val q = query.trim()
        if (q.isEmpty()) return
        // Math resolves synchronously and offline; no spinner for something instant.
        val offline = QueryEngine.evaluateMath(q)
        if (offline != null) {
            answer = Answer.Math(offline)
            return
        }
        loading = true
        scope.launch {
            answer = client.query(q)
            loading = false
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
            onValueChange = { query = it },
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
                else -> answer?.let { ResultCard(it, theme) }
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
                    Text("Source: ${answer.source} \u2197", color = theme.muted, fontSize = 12.sp)
                }
            }

            is Answer.Miss -> Text(answer.message, color = theme.muted, fontSize = 16.sp)
        }
    }
}
