package com.nulljosh.nimble

import androidx.compose.foundation.Image
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
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
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlin.time.Clock
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.decodeToImageBitmap

@Composable
fun SearchScreen(
    history: SearchHistory,
    modifier: Modifier = Modifier,
    voice: Voice? = null,
    /** Reads an answer aloud, or null where the platform has no voice. */
    speech: Speech? = null,
    /** The offline pack's store on this platform, or null: no Settings button when null. */
    packStore: OfflinePackStore? = null,
    /** A question shared in from another app (Android share sheet); asked as soon as it arrives. */
    sharedQuestion: String? = null,
    /** Bumped each time the app comes back to the front; a stale live answer then asks again. */
    resumed: Int = 0,
) {
    val client = remember { AnswerClient(offlinePack = { packStore?.load() }) }
    val scope = rememberCoroutineScope()

    val systemDark = isSystemInDarkTheme()
    // The saved pick wins; a first launch follows the system's light or dark setting.
    var theme by remember {
        val saved = loadThemeName()?.let { n -> NimbleTheme.entries.firstOrNull { it.name == n } }
        mutableStateOf(saved ?: if (systemDark) NimbleTheme.Night else NimbleTheme.Yellow)
    }
    SystemBarsStyle(theme.isDark)
    var query by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf<Answer?>(null) }
    var loading by remember { mutableStateOf(false) }
    /** Voice loop: set when the mic hands over a question, so its answer is read back once. */
    var speakNext by remember { mutableStateOf(false) }
    var recent by remember { mutableStateOf(history.list()) }
    var showHistory by remember { mutableStateOf(false) }
    // The question the shown answer belongs to, and the answer Tell me more already grew (it grows once).
    var asked by remember { mutableStateOf("") }
    var grown by remember { mutableStateOf<Answer?>(null) }
    var showSettings by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val placeholder = remember { QueryEngine.randomSuggestion() }

    // Only a real answer is worth remembering; a miss is not. The answer's text is kept with the question, on this device only.
    fun record(q: String, a: Answer) {
        if (a is Answer.Miss) { speakNext = false; return }
        history.add(q, historySnippet(a))
        recent = history.list()
    }

    fun newQuestion() {
        query = ""
        answer = null
        client.turns.clear()  // a new question starts a new conversation
        loading = false
        speech?.speak(null) {}
    }

    fun submit(text: String = query) {
        val q = text.trim()
        if (q.isEmpty()) return
        query = q
        asked = q
        speech?.speak(null) {}  // a new question stops the last answer's reading
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

    LaunchedEffect(resumed) {
        if (resumed > 0 && answer?.isStale(Freshness.now().epochMillis) == true && query.trim() == asked) submit(asked)
    }
    LaunchedEffect(sharedQuestion) {
        val q = sharedQuestion ?: return@LaunchedEffect
        showHistory = false
        showSettings = false
        submit(q)
    }

    if (showSettings) {
        SettingsScreen(
            store = packStore,
            theme = theme,
            onTheme = { theme = it; saveThemeName(it.name) },
            onBack = { showSettings = false },
            modifier = modifier,
        )
        return
    }

    if (showHistory) {
        HistoryScreen(
            entries = recent,
            theme = theme,
            now = Clock.System.now().toEpochMilliseconds(),
            onBack = { showHistory = false },
            onAsk = { q ->
                showHistory = false
                submit(q)
            },
            onCopy = { keys -> clipboard.setText(AnnotatedString(history.copyText(keys))) },
            onDelete = { keys ->
                history.remove(keys)
                recent = history.list()
            },
            modifier = modifier,
        )
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(theme.background)
            .safeDrawingPadding()
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
        }

        Spacer(Modifier.height(20.dp))

        SearchField(
            query = query,
            onChange = {
                query = it
                if (it.isBlank()) answer = null
            },
            placeholder = placeholder,
            theme = theme,
            onSubmit = { submit() },
            // The mic sits at the trailing edge; the first transcript fills the field and runs.
            mic = if (voice != null) {
                { MicButton(theme.muted) { voice.listen { heard -> speakNext = true; submit(heard) } } }
            } else null,
        )

        // The tools row: History always; New question once an answer is on screen.
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            ToolButton(tr("History"), theme) { showHistory = true }
            ToolButton(tr("Settings"), theme) { showSettings = true }
            Spacer(Modifier.weight(1f))
            if (answer != null) ToolButton(tr("New question"), theme) { newQuestion() }
        }

        Spacer(Modifier.height(16.dp))

        Box(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
            when {
                loading -> NimMark("think", 96.dp)
                answer != null -> answer?.let { a ->
                    Column {
                        ResultCard(a, theme, client)
                        val say = historySnippet(a)
                        val canListen = speech != null && a !is Answer.Miss && !say.isNullOrBlank()
                        // Tell me more asks the AI, so a site's own page (source is a host) has nothing to grow into.
                        val canMore = a is Answer.Text && a !== grown && !Regex("^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$").matches(a.source)
                        var speaking by remember(a) { mutableStateOf(false) }
                        var telling by remember(a) { mutableStateOf(false) }
                        // This is wrong: sent once per answer, never in Private mode.
                        val canReport = a is Answer.Text && client.canReport
                        var reported by remember(asked) { mutableStateOf(false) }
                        // A spoken question hears its answer without a tap.
                        LaunchedEffect(a) {
                            if (canListen && speakNext) { speakNext = false; speaking = true; speech?.speak(say) { speaking = false } }
                        }
                        if (canListen || canMore || canReport) {
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                // Listen: the phone's own voice reads the answer. A second tap stops it.
                                if (canListen) ToolButton(if (speaking) tr("Stop") else tr("Listen"), theme) {
                                    if (speaking) { speech?.speak(null) {}; speaking = false }
                                    else { speaking = true; speech?.speak(say) { speaking = false } }
                                }
                                // Tell me more: the answer grows to three sentences in place, once.
                                if (canMore && a is Answer.Text) ToolButton(if (telling) tr("Thinking…") else tr("Tell me more"), theme) {
                                    if (telling) return@ToolButton
                                    telling = true
                                    scope.launch {
                                        val more = client.tellMore(asked)
                                        telling = false
                                        if (answer === a) {
                                            val next = if (more != null) a.copy(body = more) else a
                                            grown = next
                                            answer = next
                                        }
                                    }
                                }
                                if (canReport && a is Answer.Text) ToolButton(if (reported) tr("Thanks, we'll check it") else tr("This is wrong"), theme) {
                                    if (reported) return@ToolButton
                                    reported = true
                                    scope.launch { if (!client.reportWrong(asked, a.body)) reported = false }
                                }
                            }
                        }
                    }
                }
                query.isBlank() && recent.isNotEmpty() -> RecentList(
                    entries = recent.take(8),
                    theme = theme,
                    onPick = { submit(it) },
                    onClear = {
                        history.clear()
                        client.turns.clear()
                        recent = emptyList()
                    },
                )
                // Nothing asked yet and no history: Nim waves hello.
                query.isBlank() -> NimMark("wave", 120.dp)
            }
        }

        Text(
            tr("Math runs offline."),
            color = theme.muted,
            fontSize = 12.sp,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        )
    }
}

/** A labeled 48dp pill button: outlined in the theme's muted colour, text in the theme's text colour. */
@Composable
internal fun ToolButton(label: String, theme: NimbleTheme, onClick: () -> Unit) {
    Box(
        Modifier
            .defaultMinSize(minHeight = 48.dp)
            .border(1.dp, theme.hairline, CircleShape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = theme.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
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
                tr("RECENT"),
                color = theme.accent,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                tr("Clear"),
                color = theme.muted,
                fontSize = 12.sp,
                modifier = Modifier.clickable(role = Role.Button, onClickLabel = tr("Clear history"), onClick = onClear).padding(vertical = 4.dp)
            )
        }
        for (e in entries) {
            Text(
                e.q,
                color = theme.text,
                fontSize = 16.sp,
                maxLines = 1,
                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = tr("Ask again")) { onPick(e.q) }.padding(vertical = 10.dp)
            )
        }
    }
}

/**
 * The question field: a 56dp glass-free capsule (surface fill, hairline edge, accent ring on focus), a drawn
 * magnifier at the start, the mic and a yellow Ask pill at the end. Same shape as the web's `.field`.
 */
@Composable
private fun SearchField(
    query: String,
    onChange: (String) -> Unit,
    placeholder: String,
    theme: NimbleTheme,
    onSubmit: () -> Unit,
    mic: (@Composable () -> Unit)?,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .background(theme.surface, CircleShape)
            .border(if (focused) 2.dp else 1.dp, if (focused) theme.accent else theme.hairline, CircleShape)
            .padding(start = 20.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(Modifier.size(20.dp)) {
            val w = 2.5.dp.toPx()
            drawCircle(theme.accent, radius = size.width * 0.34f, center = Offset(size.width * 0.42f, size.height * 0.42f), style = Stroke(w))
            drawLine(theme.accent, Offset(size.width * 0.68f, size.height * 0.68f), Offset(size.width * 0.92f, size.height * 0.92f), w, StrokeCap.Round)
        }
        Spacer(Modifier.width(12.dp))
        BasicTextField(
            value = query,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(color = theme.text, fontSize = 18.sp),
            cursorBrush = SolidColor(theme.accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSubmit() }),
            interactionSource = source,
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) Text(placeholder, color = theme.muted, fontSize = 18.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    inner()
                }
            },
        )
        mic?.invoke()
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .defaultMinSize(minWidth = 64.dp, minHeight = 48.dp)
                .background(NimbleTheme.Yellow.accent, CircleShape)
                .clickable(role = Role.Button, onClickLabel = tr("Ask"), onClick = onSubmit)
                .padding(horizontal = 20.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(tr("Ask"), color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
internal fun ThemeSwatches(selected: NimbleTheme, onSelect: (NimbleTheme) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (t in NimbleTheme.entries.filter { it != NimbleTheme.Night }) {
            Box(
                Modifier
                    .size(24.dp)
                    .background(t.accent, CircleShape)
                    .border(
                        width = if (t == selected) 2.dp else 1.dp,
                        color = if (t == selected) selected.text else selected.muted,
                        shape = CircleShape
                    )
                    .selectable(selected = t == selected, role = Role.RadioButton, onClick = { onSelect(t) })
                    .semantics { contentDescription = tr("{s} theme", "s" to t.label) }
            )
        }
    }
}

/**
 * Lead photo above a text answer: a 16:9 frame, 12dp corners, cropped from the top. The frame is
 * reserved while the bytes load so the answer does not jump; it hides itself only when the load fails.
 */
@Composable
private fun AnswerPhoto(url: String, theme: NimbleTheme, client: AnswerClient) {
    // Null while loading; Photo(null) once the load has failed.
    val photo by produceState<Photo?>(null, url) {
        value = Photo(client.imageBytes(url)?.let { runCatching { it.decodeToImageBitmap() }.getOrNull() })
    }
    val loaded = photo
    if (loaded?.bitmap == null && loaded != null) return
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(theme.muted.copy(alpha = 0.12f))
    ) {
        loaded?.bitmap?.let {
            Image(
                bitmap = it,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alignment = Alignment.TopCenter,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

private class Photo(val bitmap: ImageBitmap?)

/** A news story: sentence and outlet, a 56dp thumbnail only when the feed has one, and the row opens the link. */
@Composable
private fun NewsResult(news: Answer.News, theme: NimbleTheme, client: AnswerClient) {
    val uriHandler = LocalUriHandler.current
    Column {
        news.items.forEachIndexed { index, item ->
            if (index > 0) Spacer(Modifier.height(16.dp))
            Row(
                Modifier.fillMaxWidth().clickable(onClickLabel = tr("Open {s}", "s" to item.outlet)) { uriHandler.openUri(item.url) },
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(item.sentence, color = theme.text, fontSize = 16.sp)
                    if (item.outlet.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text(item.outlet, color = theme.muted, fontSize = 12.sp)
                    }
                }
                item.imageUrl?.let {
                    Spacer(Modifier.width(12.dp))
                    NewsThumb(it, theme, client)
                }
            }
        }
        news.asOf?.let {
            Spacer(Modifier.height(12.dp))
            AsOfLine(it, theme)
        }
        Spacer(Modifier.height(12.dp))
        Text(tr("Source: {s}", "s" to news.source), color = theme.muted, fontSize = 12.sp)
    }
}

@Composable
private fun NewsThumb(url: String, theme: NimbleTheme, client: AnswerClient) {
    val bitmap by produceState<ImageBitmap?>(null, url) {
        value = client.imageBytes(url)?.let { runCatching { it.decodeToImageBitmap() }.getOrNull() }
    }
    Box(
        Modifier
            .size(56.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(theme.muted.copy(alpha = 0.12f))
    ) {
        bitmap?.let { Image(bitmap = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

/** Small site favicon above a web answer. Draws nothing until it loads, and nothing if it fails. */
@Composable
private fun SiteIcon(url: String, client: AnswerClient) {
    val bitmap by produceState<ImageBitmap?>(null, url) {
        value = client.imageBytes(url)?.let { runCatching { it.decodeToImageBitmap() }.getOrNull() }
    }
    bitmap?.let { Image(bitmap = it, contentDescription = null, modifier = Modifier.size(24.dp)) }
}

/**
 * tr("Why this answer"): a 48dp toggle under the source line. Open, it shows the Wikipedia intro behind the answer and a
 * 48dp link to the page. Taps here stop at the toggle, so they do not also open the whole answer.
 */
@Composable
private fun WhyThisAnswer(text: String, pageUrl: String?, theme: NimbleTheme) {
    val uriHandler = LocalUriHandler.current
    var open by remember { mutableStateOf(false) }
    Box(
        Modifier
            .defaultMinSize(minHeight = 48.dp)
            .clickable(onClickLabel = if (open) tr("Hide why this answer") else tr("Why this answer")) { open = !open },
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(if (open) tr("Hide why this answer") else tr("Why this answer"), color = theme.accent, fontSize = 14.sp)
    }
    if (open) {
        Text(text, color = theme.text, fontSize = 14.sp)
        pageUrl?.let {
            Box(
                Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable(onClickLabel = tr("Read on Wikipedia")) { uriHandler.openUri(it) },
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(tr("Read on Wikipedia"), color = theme.accent, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun ResultCard(answer: Answer, theme: NimbleTheme, client: AnswerClient) {
    Column(Modifier.widthIn(max = 640.dp)) {
        when (answer) {
            is Answer.Math -> Text(
                answer.value,
                color = theme.accent,
                fontSize = 44.sp,
                fontWeight = FontWeight.Bold
            )

            is Answer.CardAnswer -> CardResult(answer.card, theme)

            is Answer.Market -> MarketResult(answer, theme)

            is Answer.Sports -> SportsResult(answer, theme)

            is Answer.News -> NewsResult(answer, theme, client)

            is Answer.Disagree -> DisagreeResult(answer, theme)

            is Answer.Text -> {
                // Whole answer opens its source; AI answers have none, so fall back to a web search.
                val uriHandler = LocalUriHandler.current
                Column(Modifier.clickable { answer.sourceUrl?.let(uriHandler::openUri) }) {
                    // The header word, then the one quiet line (resting note, background caption), as on the web and in Swift.
                    Text(
                        (if (answer.background) tr("Background") else tr("Answer")).uppercase(),
                        color = theme.muted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                    )
                    QueryEngine.leadLines(answer.background, answer.aiNote).forEach { line ->
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // Nim dozes beside the resting note: the free AI is out for the day.
                            if (line == RESTING_NOTE) { NimMark("doze", 32.dp); Spacer(Modifier.width(12.dp)) }
                            Text(line, color = theme.muted, fontSize = 13.sp)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    answer.photoUrl?.let {
                        AnswerPhoto(it, theme, client)
                        answer.photoCredit?.let { credit ->
                            Spacer(Modifier.height(4.dp))
                            Text(credit, color = theme.muted, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    answer.imageUrl?.let {
                        SiteIcon(it, client)
                        Spacer(Modifier.height(8.dp))
                    }
                    answer.heading?.let {
                        Text(it, color = theme.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                    }
                    Text(answer.body, color = theme.text, fontSize = 16.sp, textDecoration = TextDecoration.Underline)
                    Spacer(Modifier.height(12.dp))
                    answer.asOf?.let {
                        AsOfLine(it, theme)
                        Spacer(Modifier.height(12.dp))
                    }
                    Text(tr("Source: {s}", "s" to answer.source), color = theme.muted, fontSize = 12.sp)
                    // Up to two linked pages the answer's own words match, one 48dp tap row each, names only.
                    answer.sources.forEach { src ->
                        Text(
                            src.name,
                            color = theme.muted,
                            fontSize = 12.sp,
                            textDecoration = TextDecoration.Underline,
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp).clickable { uriHandler.openUri(src.url) }.wrapContentHeight(Alignment.CenterVertically),
                        )
                    }
                    answer.grounding?.let {
                        Spacer(Modifier.height(8.dp))
                        WhyThisAnswer(it, answer.sourceUrl, theme)
                    }
                }
            }

            is Answer.Miss -> Text(answer.message, color = theme.muted, fontSize = 16.sp)
        }
    }
}
