package com.nulljosh.nimble

/** Ported from Sources/Models/QueryEngine.swift -- keep the two in step. */
enum class QueryType { MATH, FACTUAL, DEFINITION, GENERIC }

object QueryEngine {

    private val mathWords = Regex(
        "\\b(square root|sqrt|sin|cos|tan|log|ln|absolute|power|exponent|factorial|percentage|modulo|mod)\\b"
    )
    private val operatorish = Regex("[+\\-*/^%]|times|divided|multiplied|plus|minus|squared|cubed")
    private val numberish = Regex(
        "\\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|" +
            "fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|" +
            "sixty|seventy|eighty|ninety|hundred|thousand|million"
    )
    private val askPrefix = Regex("^(ask|answer|question|about|to)\\b")
    private val questionWord = Regex("^(who|what|when|where|why|how)\\b")
    private val copula = Regex("\\b(is|was|are|were)\\s+(the\\s+)?")
    private val definitionPrefix = Regex("^(define|what is|what does|what's|whats|definition|meaning)")

    fun classify(input: String): QueryType {
        val q = input.lowercase().trim()
        if (isMath(q)) return QueryType.MATH
        if (questionWord.containsMatchIn(q) || copula.containsMatchIn(q)) return QueryType.FACTUAL
        if (definitionPrefix.containsMatchIn(q)) return QueryType.DEFINITION
        return QueryType.GENERIC
    }

    private fun isMath(q: String): Boolean {
        if (mathWords.containsMatchIn(q)) return true
        return operatorish.containsMatchIn(q) &&
            numberish.containsMatchIn(q) &&
            !askPrefix.containsMatchIn(q)
    }

    private val mathFunctionNames = listOf("sqrt", "sin", "cos", "tan", "log", "ln", "abs", "pow", "mod", "pi")
    private const val MATH_CHARS = "0123456789.+-*/^%() ,eE"

    /**
     * Returns the formatted answer, or null when the input is not arithmetic we can do
     * offline. Mirrors the Swift ordering: natural language first, then the prose guard,
     * then the evaluator.
     */
    fun evaluateMath(input: String): String? {
        val expr = input.trim()
        if (expr.isEmpty()) return null

        parseNaturalLanguageMath(expr)?.let { nl ->
            Expr.eval(nl)?.let { return Expr.format(it) }
        }

        // Strip the function names, then anything left that is not a math character means
        // this is prose, not an expression.
        var probe = expr.lowercase()
        for (fn in mathFunctionNames) probe = probe.replace(fn, "")
        if (!probe.all { it in MATH_CHARS || it.isWhitespace() }) return null

        // A bare number is not a calculation.
        val hasOperation = expr.any { it in "+-*/^%" } ||
            mathFunctionNames.any { expr.lowercase().contains("$it(") } ||
            expr.lowercase() == "pi" || expr.lowercase() == "e"
        if (!hasOperation) return null

        return Expr.eval(expr)?.let { Expr.format(it) }
    }

    private val wordNumbers = mapOf(
        "zero" to "0", "one" to "1", "two" to "2", "three" to "3", "four" to "4",
        "five" to "5", "six" to "6", "seven" to "7", "eight" to "8", "nine" to "9",
        "ten" to "10", "eleven" to "11", "twelve" to "12", "thirteen" to "13",
        "fourteen" to "14", "fifteen" to "15", "sixteen" to "16", "seventeen" to "17",
        "eighteen" to "18", "nineteen" to "19", "twenty" to "20", "thirty" to "30",
        "forty" to "40", "fifty" to "50", "sixty" to "60", "seventy" to "70",
        "eighty" to "80", "ninety" to "90", "hundred" to "100", "thousand" to "1000",
        "million" to "1000000"
    )

    private val wordOperators = mapOf(
        "plus" to "+", "add" to "+", "added to" to "+",
        "minus" to "-", "subtract" to "-", "less" to "-",
        "times" to "*", "multiplied by" to "*",
        "divided by" to "/", "over" to "/",
        "to the power of" to "^", "squared" to "^2", "cubed" to "^3"
    )

    private val fillerPatterns = listOf(
        "what is ", "whats ", "what's ", "calculate ", "how much is ",
        "compute ", "solve ", "evaluate ", "the answer to ", "result of "
    )

    private val fractions = mapOf("half" to 2, "third" to 3, "quarter" to 4)

    /** "half of 250", "25% off 80", "15 percent tip on 60", "average of 2, 4 and 9". Mirrors docs/engine.js. */
    private fun everydayMath(s: String): String = s
        // "1,000" is one thousand; "2, 4 and 9" (comma then space) stays a list.
        .replace(Regex("(\\d),(\\d{3})\\b"), "\$1\$2")
        // "split 120 four ways", "double 36", "what percent is 20 of 80", "20 is what percent of 80", "increase 50 by 10%".
        .replace(Regex("^split ([\\d.]+) (\\w+) ways$")) { m -> "(${m.groupValues[1]}/${wordNumbers[m.groupValues[2]] ?: m.groupValues[2]})" }
        .replace(Regex("^(double|twice|triple) ([\\d.]+)$")) { "(${it.groupValues[2]}*${if (it.groupValues[1] == "triple") 3 else 2})" }
        .replace(Regex("^(?:what )?percent(?:age)? is ([\\d.]+) of ([\\d.]+)$"), "(\$1/\$2*100)")
        .replace(Regex("^([\\d.]+) is what percent(?:age)? of ([\\d.]+)$"), "(\$1/\$2*100)")
        .replace(Regex("^(increase|decrease|raise|reduce) ([\\d.]+) by ([\\d.]+) ?(?:%|percent)$")) {
            "(${it.groupValues[2]}*(1${if (it.groupValues[1] == "increase" || it.groupValues[1] == "raise") "+" else "-"}${it.groupValues[3]}/100))"
        }
        .replace(Regex("^an? (?=\\d)"), "")
        .replace(Regex("\\b(?:a |one )?(half|third|quarter) of ([\\d.]+)")) { "(${it.groupValues[2]}/${fractions[it.groupValues[1]]})" }
        .replace(Regex("([\\d.]+)\\s*(?:%|percent)\\s*off\\s*([\\d.]+)"), "(\$2-\$2*\$1/100)")
        .replace(Regex("([\\d.]+)\\s*(?:%|percent)\\s*(?:tip\\s+)?(?:of|on)\\s*"), "\$1/100*")
        .replace(Regex("\\b(?:the )?(?:average|mean) of ([\\d.]+(?:\\s*(?:,\\s*and\\b|,|\\band\\b)\\s*[\\d.]+)+)")) {
            val n = it.groupValues[1].split(Regex("\\s*(?:,|\\band\\b)\\s*")).filter(String::isNotEmpty)
            "((${n.joinToString("+")})/${n.size})"
        }

    /** "whats nine plus ten" -> "9 + 10". Null when it is not word-math. */
    fun parseNaturalLanguageMath(input: String): String? {
        var text = input.lowercase().trim()

        for (filler in fillerPatterns) {
            if (text.startsWith(filler)) text = text.removePrefix(filler)
        }
        text = text.replace("?", "").trim()

        val everyday = everydayMath(text)
        if (everyday == text) {
            if (!wordNumbers.keys.any { text.contains(it) }) return null
            if (!wordOperators.keys.any { text.contains(it) }) return null
        }
        text = everyday

        // Longest first so "to the power of" wins over "over", and "multiplied by" over
        // "multiplied". Word-boundaried so "less" does not chew through "unless".
        for ((word, op) in wordOperators.entries.sortedByDescending { it.key.length }) {
            text = text.replace(Regex("\\b" + Regex.escape(word) + "\\b"), " $op ")
        }
        for ((word, num) in wordNumbers) {
            text = text.replace(Regex("\\b$word\\b"), num)
        }
        // "twenty one" is 21, "one hundred" is 100, "two thousand" is 2000 (as on the web).
        text = text.replace(Regex("\\b([2-9]0) ([1-9])\\b")) { (it.groupValues[1].toInt() + it.groupValues[2].toInt()).toString() }
            .replace(Regex("\\b(\\d+) (100|1000|1000000)\\b")) { (it.groupValues[1].toLong() * it.groupValues[2].toLong()).toString() }

        text = text.replace(Regex("\\s+"), " ").trim()
        if (!text.all { it in "0123456789.+-*/^%() " }) return null
        return text
    }

    val defaultSuggestions = listOf(
        "(3 + 5) * 12",
        "1 mile to feet",
        "10 km to miles",
        "100 - 37",
        "1024 * 1024",
        "15% of 240",
        "180 C to F",
        "2 hours to seconds",
        "2^10",
        "255 in binary",
        "256 / 8",
        "3 cups to ml",
        "500 MB to GB",
        "7 factorial",
        "Atomic number of carbon"
    )

    fun randomSuggestion(): String = defaultSuggestions.random()

    /** The caption above a background answer. Same words as QueryResult.backgroundCaption in Swift. */
    const val BACKGROUND_CAPTION = "Not a direct answer to your question. Background from Wikipedia:"

    private val letterRun = Regex("\\p{L}+")
    private val questionWords = setOf("what", "who", "when", "where", "which", "how")
    private val questionFiller = questionWords + setOf(
        "was", "is", "are", "were", "the", "a", "an", "of", "in", "on", "to", "did", "does", "do", "it", "its", "that",
    )

    /**
     * A specific question ("what was the first color photograph of a rainbow") that only a generic topic page answers.
     * Same rule as isSpecificQuestion in docs/engine.js and Sources/Models/QueryEngine.swift.
     */
    fun isSpecificQuestion(question: String, topic: String): Boolean {
        val words = letterRun.findAll(question.lowercase()).map { it.value }.toList()
        val first = words.firstOrNull() ?: return false
        if (first !in questionWords) return false
        val topicWords = letterRun.findAll(topic.lowercase()).map { it.value }.toSet()
        return words.any { it !in questionFiller && it !in topicWords }
    }

    /** Marks a Wikipedia topic page that answers a specific question as background. Anything else passes through. */
    fun labelIfGeneric(answer: Answer.Text, question: String): Answer.Text {
        val topic = answer.heading ?: return answer
        if (answer.source != "Wikipedia" || !isSpecificQuestion(question, topic)) return answer
        return answer.copy(background = true)
    }

    /** The quiet lines under a text answer's header: one line only, the resting note first, then the background caption. */
    fun leadLines(background: Boolean, aiNote: String?): List<String> =
        if (background) listOf(listOfNotNull(aiNote, BACKGROUND_CAPTION).joinToString(" ")) else listOfNotNull(aiNote)

    /**
     * Reshapes a question into better search terms, matching the Swift preprocessQuery.
     * Returns the DuckDuckGo query and the Wikipedia query, which differ for "where is X".
     */
    fun preprocess(raw: String): Pair<String, String> {
        var q = raw.trim().trimEnd('?').trim()

        Regex("(?i)^who\\s+(?:is|was|are|were)\\s+(?:the\\s+)?(.+)$").find(q)?.let {
            val rest = it.groupValues[1].trim()
            if (rest.isNotEmpty()) return rest to rest
        }
        Regex("(?i)^what(?:'s|\\s+is|\\s+was)\\s+(?:the\\s+)?(.+)$").find(q)?.let {
            val rest = it.groupValues[1].trim()
            if (rest.isNotEmpty()) return rest to rest
        }
        Regex("(?i)^where\\s+is\\s+(.+?)(?:\\s+located)?$").find(q)?.let {
            val rest = it.groupValues[1].trim()
            if (rest.isNotEmpty()) return "$rest location" to rest
        }
        Regex("(?i)^how\\s+(much|many|tall|old|big|far|long|wide|deep|large|small|fast|heavy)\\s+is\\s+(.+)$")
            .find(q)?.let {
                val adj = it.groupValues[1].lowercase()
                val entity = it.groupValues[2].trim()
                if (entity.isNotEmpty()) return "$entity $adj" to entity
            }

        return raw to raw
    }
}
