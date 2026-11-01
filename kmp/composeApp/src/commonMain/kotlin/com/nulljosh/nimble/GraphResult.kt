package com.nulljosh.nimble

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToLong

/** "plot x^2", as on the web and the iPhone: drag pans, pinch or the wheel zooms, a tap or the pointer reads the point, double tap resets. */
@Composable
internal fun GraphResult(answer: Answer.Graph, theme: NimbleTheme) {
    var x0 by remember(answer) { mutableStateOf(-10.0) }
    var x1 by remember(answer) { mutableStateOf(10.0) }
    var traceX by remember(answer) { mutableStateOf<Double?>(null) }
    val pts = remember(answer, x0, x1) { if (x0 == -10.0 && x1 == 10.0) answer.points else Graph.points(answer.expr, x0, x1) }
    val measurer = rememberTextMeasurer()

    fun xAt(px: Float, width: Int) = x0 + px / max(width, 1) * (x1 - x0)
    fun setRange(a: Double, b: Double) { if (b - a in 1e-6..1e7) { x0 = a; x1 = b } }
    fun zoom(atPx: Float, width: Int, f: Double) { val at = xAt(atPx, width); setRange(at - (at - x0) * f, at + (x1 - at) * f) }

    Column {
        Canvas(
            Modifier.fillMaxWidth().height(160.dp)
                .semantics { contentDescription = "Graph of y = ${answer.expr}. Drag to pan, pinch to zoom, double tap to reset." }
                .pointerInput(answer) {
                    detectTransformGestures { centroid, pan, zoomBy, _ ->
                        val dx = pan.x / max(size.width, 1) * (x1 - x0)
                        setRange(x0 - dx, x1 - dx)
                        if (zoomBy != 1f) zoom(centroid.x, size.width, 1.0 / zoomBy)
                        traceX = xAt(centroid.x, size.width)
                    }
                }
                .pointerInput(answer) {
                    detectTapGestures(
                        onDoubleTap = { x0 = -10.0; x1 = 10.0; traceX = null },
                        onTap = { traceX = xAt(it.x, size.width) },
                    )
                }
                .pointerInput(answer) {
                    // Desktop: the pointer traces as it moves, the wheel zooms around it.
                    awaitPointerEventScope {
                        while (true) {
                            val e = awaitPointerEvent()
                            val c = e.changes.firstOrNull() ?: continue
                            when (e.type) {
                                PointerEventType.Move -> if (!c.pressed) traceX = xAt(c.position.x, size.width)
                                PointerEventType.Exit -> traceX = null
                                PointerEventType.Scroll -> { zoom(c.position.x, size.width, 1.15.pow(c.scrollDelta.y.toDouble())); c.consume() }
                                else -> {}
                            }
                        }
                    }
                },
        ) {
            val ys = pts.map { it.second }
            val y0 = ys.minOrNull() ?: return@Canvas
            val y1 = ys.maxOrNull() ?: return@Canvas
            val ySpan = max(y1 - y0, 1e-9)
            fun px(x: Double) = ((x - x0) / (x1 - x0) * size.width).toFloat()
            fun py(y: Double) = (size.height - (y - y0) / ySpan * size.height).toFloat()
            if (y0 <= 0 && y1 >= 0) drawLine(theme.hairline, Offset(0f, py(0.0)), Offset(size.width, py(0.0)), 1.dp.toPx())
            if (x0 <= 0 && x1 >= 0) drawLine(theme.hairline, Offset(px(0.0), 0f), Offset(px(0.0), size.height), 1.dp.toPx())
            val curve = Path()
            var prev: Double? = null
            // Break the line where sampled neighbours are far apart (asymptotes).
            for ((x, y) in pts) {
                if (prev == null || x - prev > (x1 - x0) / 50) curve.moveTo(px(x), py(y)) else curve.lineTo(px(x), py(y))
                prev = x
            }
            drawPath(curve, theme.accent, style = Stroke(width = 2.dp.toPx(), join = StrokeJoin.Round))
            val tx = traceX ?: return@Canvas
            val ty = Graph.value(answer.expr, tx)?.takeIf { it.isFinite() } ?: return@Canvas
            val at = Offset(px(tx), py(ty).coerceIn(0f, size.height))
            drawCircle(theme.accent, 5.dp.toPx(), at)
            val label = measurer.measure("(${short(tx)}, ${short(ty)})", TextStyle(color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold))
            drawText(label, topLeft = Offset(
                (at.x + 10.dp.toPx()).coerceAtMost(size.width - label.size.width),
                (at.y - 10.dp.toPx() - label.size.height).coerceAtLeast(0f),
            ))
        }
        Spacer(Modifier.height(8.dp))
        Text("y = ${answer.expr}", color = theme.muted, fontSize = 15.sp)
    }
}

/** Four significant digits for the trace label. */
private fun short(v: Double): String {
    if (abs(v) < 1e-9) return "0"
    val d = 10.0.pow(3 - floor(log10(abs(v))).toInt())
    return ((v * d).roundToLong() / d).toString().removeSuffix(".0")
}
