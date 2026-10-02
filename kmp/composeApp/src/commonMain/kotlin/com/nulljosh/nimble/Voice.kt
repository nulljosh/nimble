package com.nulljosh.nimble

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

/**
 * Speech to text where the platform has it. Android passes one (RecognizerIntent); desktop
 * passes none, because the JVM has no speech recognizer, so the screen shows no mic there.
 */
fun interface Voice {
    /** Opens the recognizer; [onHeard] gets the first transcript, never an empty one. */
    fun listen(onHeard: (String) -> Unit)
}

/** A 20dp stroke mic in a 40dp touch target: capsule, cradle, stem, base. */
@Composable
fun MicButton(tint: Color, onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .clip(CircleShape)
            .clickable(onClickLabel = "Ask out loud", role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(20.dp)) {
            val u = size.width / 24f // drawn on a 24 unit grid
            val w = 1.75f * u
            val stroke = Stroke(width = w, cap = StrokeCap.Round)
            drawRoundRect(
                tint,
                topLeft = Offset(9f * u, 2.5f * u),
                size = Size(6f * u, 11.5f * u),
                cornerRadius = CornerRadius(3f * u),
                style = stroke,
            )
            drawArc(
                tint,
                startAngle = 0f,
                sweepAngle = 180f,
                useCenter = false,
                topLeft = Offset(5.5f * u, 5f * u),
                size = Size(13f * u, 13f * u),
                style = stroke,
            )
            drawLine(tint, Offset(12f * u, 18f * u), Offset(12f * u, 21.5f * u), strokeWidth = w, cap = StrokeCap.Round)
            drawLine(tint, Offset(8.5f * u, 21.5f * u), Offset(15.5f * u, 21.5f * u), strokeWidth = w, cap = StrokeCap.Round)
        }
    }
}
