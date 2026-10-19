package com.nulljosh.nimble

import kotlin.math.round

/** Unit conversion with no network. Ported from docs/engine.js (U, convertValue, tryConvert); keep the three in step. */
object Units {
    // ponytail: flat table in base units; add rows, not code.
    private val U: Map<String, Pair<Double, String>> = buildMap {
        fun put(kind: String, factor: Double, vararg names: String) = names.forEach { put(it, factor to kind) }
        put("len", .001, "mm"); put("len", .01, "cm"); put("len", 1.0, "m", "meter", "meters", "metre", "metres")
        put("len", 1000.0, "km", "kilometer", "kilometers", "kilometre", "kilometres")
        put("len", .0254, "in", "inch", "inches"); put("len", .3048, "ft", "foot", "feet")
        put("len", .9144, "yd", "yard", "yards"); put("len", 1609.344, "mi", "mile", "miles")
        put("mass", .001, "g", "gram", "grams"); put("mass", 1.0, "kg", "kilogram", "kilograms")
        put("mass", .028349523125, "oz", "ounce", "ounces"); put("mass", .45359237, "lb", "lbs", "pound", "pounds")
        put("vol", .001, "ml"); put("vol", 1.0, "l", "liter", "liters", "litre", "litres")
        put("vol", .2365882365, "cup", "cups"); put("vol", 3.785411784, "gal", "gallon", "gallons")
        put("speed", .44704, "mph"); put("speed", .277778, "kph", "kmh", "km/h")
        put("data", 1e3, "kb", "kilobytes"); put("data", 1e6, "mb", "megabytes"); put("data", 1e9, "gb", "gigabytes"); put("data", 1e12, "tb", "terabytes")
        put("time", 1.0, "sec", "second", "seconds"); put("time", 60.0, "min", "minute", "minutes")
        put("time", 3600.0, "hr", "hour", "hours"); put("time", 86400.0, "day", "days"); put("time", 604800.0, "week", "weeks")
        put("temp", 0.0, "c", "celsius", "f", "fahrenheit", "k", "kelvin")
    }

    internal fun convertValue(v: Double, from: String, to: String): Double? {
        val a = U[from] ?: return null
        val b = U[to] ?: return null
        if (a.second != b.second) return null
        if (a.second == "temp") {
            val k = when (from[0]) { 'c' -> v + 273.15; 'f' -> (v - 32) * 5 / 9 + 273.15; else -> v }
            return when (to[0]) { 'c' -> k - 273.15; 'f' -> (k - 273.15) * 9 / 5 + 32; else -> k }
        }
        return v * a.first / b.first
    }

    private val direct = Regex("""^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*°?\s*([a-z/]+)\s+(?:to|in|into|as)\s+°?([a-z/]+)\??$""")
    private val howMany = Regex("""^how many\s+([a-z/]+)\s+(?:are\s+)?in\s+(-?\d+(?:\.\d+)?)\s*°?\s*([a-z/]+)\??$""")

    /** "10 km to miles" -> "10 km = 6.213712 miles"; "180 c to f" reads back as °C and °F. Null when it is not a conversion. */
    fun convert(input: String): String? {
        val q = input.trim().lowercase()
        val (v, from, to) = direct.find(q)?.destructured?.let { (v, f, t) -> Triple(v, f, t) }
            ?: howMany.find(q)?.destructured?.let { (t, v, f) -> Triple(v, f, t) } ?: return null
        val out = convertValue(v.toDouble(), from, to) ?: return null
        val temp = U[from]?.second == "temp"
        fun name(u: String) = if (temp) mapOf('c' to "°C", 'f' to "°F", 'k' to "K")[u[0]]!! else u
        return "${show(v.toDouble())} ${name(from)} = ${show(out)} ${name(to)}"
    }

    // Six decimals, trailing zeros dropped: the web's (+n.toFixed(6)).toString().
    private fun show(n: Double): String {
        val r = round(n * 1e6) / 1e6
        return if (r == round(r) && kotlin.math.abs(r) < 1e15) r.toLong().toString() else r.toString()
    }
}
