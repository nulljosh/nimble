import XCTest
@testable import Nimble

final class QueryEngineTests: XCTestCase {
    let engine = QueryEngine()

    func testIdentityAnswer() {
        guard case .text(_, let body, _, _, _, _, _, _, _)? = engine.identityAnswer("Who created you") else { return XCTFail("no answer") }
        XCTAssertTrue(body.contains("Joshua Trommel"))
        XCTAssertNil(engine.identityAnswer("who created the telephone"))
    }

    /// Mirrors test/constants.test.js.
    func testConstantAnswer() {
        for (q, v) in [("what is the gravitational constant", "6.67430 × 10⁻¹¹"), ("What\u{2019}s Planck\u{2019}s constant?", "6.62607015"),
                       ("avogadro's number", "6.02214076"), ("the value of the gas constant", "8.314462618"), ("acceleration due to gravity", "9.80665")] {
            guard case .text(_, let body, let source, _, _, _, _, _, _)? = engine.constantAnswer(q) else { return XCTFail(q) }
            XCTAssertTrue(body.contains(v), q)
            XCTAssertEqual(source, "NIST")
        }
        for q in ["who measured the gravitational constant", "is the speed of light constant", "speed of light in water"] {
            XCTAssertNil(engine.constantAnswer(q), q)
        }
    }

    func testSiteHost() {
        XCTAssertEqual(engine.siteHost("What\u{2019}s primitive.dev?"), "primitive.dev")
        XCTAssertEqual(engine.siteHost("tell me about linear.app"), "linear.app")
        XCTAssertNil(engine.siteHost("what is node.js"))
        XCTAssertNil(engine.siteHost("who is the ceo of apple.com in 2020"))
    }

    func testSiteAnswerUsesPageTitleAndFavicon() {
        let html = "<title>Stripe | Payments</title><meta name=\"description\" content=\"Payments for the internet.\">"
        guard case .text(let heading, let body, let source, _, let icon, _, _, _, _)? = engine.parseSite(html: html, host: "stripe.com", pageURL: "https://stripe.com/") else { return XCTFail("no answer") }
        XCTAssertEqual(heading, "Stripe | Payments")
        XCTAssertEqual(body, "Payments for the internet.")
        XCTAssertEqual(source, "stripe.com")
        XCTAssertEqual(icon, "https://www.google.com/s2/favicons?domain=stripe.com&sz=64")
    }

    func testSiteAnswerKeepsGroundingForWhyThisAnswer() {
        let html = "<title>Acme</title><meta name=\"description\" content=\"Ship faster. Then ship again.\">"
        guard case .text(_, let body, _, _, _, let grounding, _, _, _)? = engine.parseSite(html: html, host: "acme.io", pageURL: "https://acme.io/") else { return XCTFail("no answer") }
        XCTAssertEqual(body, "Ship faster.")
        XCTAssertEqual(grounding, "Ship faster. Then ship again.")
    }

    func testSiteAnswerFallsBackToOpenGraphThenJavaScriptNote() {
        let og = "<meta property=\"og:description\" content=\"Ship faster.\">"
        guard case .text(_, let ogBody, _, _, _, _, _, _, _)? = engine.parseSite(html: og, host: "acme.io", pageURL: "https://acme.io/") else { return XCTFail("no og answer") }
        XCTAssertEqual(ogBody, "Ship faster.")

        let spa = "<title>Acme App</title><div id=\"root\"></div><script src=\"/app.js\"></script>"
        guard case .text(let heading, let spaBody, _, _, _, _, _, _, _)? = engine.parseSite(html: spa, host: "acme.app", pageURL: "https://acme.app/") else { return XCTFail("no spa answer") }
        XCTAssertEqual(spaBody, "This site loads with JavaScript.")
        XCTAssertEqual(heading, "Acme App")

        XCTAssertNil(engine.parseSite(html: "", host: "acme.io", pageURL: "https://acme.io/"))
    }

    // MARK: - Basic arithmetic

    func testBasicAddition() {
        XCTAssertEqual(engine.evaluateMath("2 + 2"), "4")
    }

    func testMultiplication() {
        XCTAssertEqual(engine.evaluateMath("6 * 7"), "42")
        XCTAssertEqual(engine.evaluateMath("15% of 240"), "36")
    }

    func testDivision() {
        XCTAssertEqual(engine.evaluateMath("100 / 4"), "25")
    }

    func testSubtraction() {
        XCTAssertEqual(engine.evaluateMath("100 - 37"), "63")
    }

    func testDecimalResult() {
        let result = engine.evaluateMath("10 / 3")
        XCTAssertNotNil(result)
        // Should be ~3.3333...
        let val = Double(result!)
        XCTAssertNotNil(val)
        XCTAssertEqual(val!, 10.0 / 3.0, accuracy: 0.0001)
    }

    func testComplexExpression() {
        XCTAssertEqual(engine.evaluateMath("(10 + 5) * 2"), "30")
    }

    func testNegativeNumbers() {
        let result = engine.evaluateMath("5 - 10")
        XCTAssertEqual(result, "-5")
    }

    func testModulo() {
        XCTAssertEqual(engine.evaluateMath("17 % 5"), "2")
    }

    // MARK: - Advanced math

    func testPower() {
        XCTAssertEqual(engine.evaluateMath("2^10"), "1024")
    }

    /// The exam caught "12 squared" and "cube root of 27" answering nothing; web has the same cases in engine.test.js.
    func testSpokenPowersAndRoots() {
        XCTAssertEqual(engine.evaluateMath("12 squared"), "144")
        XCTAssertEqual(engine.evaluateMath("3 cubed"), "27")
        XCTAssertEqual(engine.evaluateMath("cube root of 27"), "3")
        XCTAssertEqual(engine.evaluateMath("square root of 49"), "7")
        XCTAssertEqual(engine.evaluateMath("what is the square root of 16"), "4")
        XCTAssertEqual(engine.evaluateMath("sqrt of 81"), "9")
        XCTAssertEqual(engine.evaluateMath("six plus two"), "8")
        XCTAssertEqual(engine.evaluateMath("half of 250"), "125")
        XCTAssertEqual(engine.evaluateMath("what is a third of 90"), "30")
        XCTAssertEqual(engine.evaluateMath("15 percent tip on 60"), "9")
        XCTAssertEqual(engine.evaluateMath("25% off 80"), "60")
        XCTAssertEqual(engine.evaluateMath("average of 2, 4 and 9"), "5")
        XCTAssertNil(engine.evaluateMath("half of the class"))
        XCTAssertEqual(engine.evaluateMath("one hundred minus seven"), "93")
        XCTAssertEqual(engine.evaluateMath("what percent is 20 of 80"), "25")
        XCTAssertEqual(engine.evaluateMath("20 is what percent of 80"), "25")
        XCTAssertEqual(engine.evaluateMath("increase 50 by 10%"), "55")
        XCTAssertEqual(engine.evaluateMath("what is 15% of 1,000"), "150")
        XCTAssertEqual(engine.evaluateMath("double 36"), "72")
        XCTAssertEqual(engine.evaluateMath("triple 15"), "45")
        XCTAssertEqual(engine.evaluateMath("how much is a 20% tip on 85"), "17")
        XCTAssertEqual(engine.evaluateMath("split 120 four ways"), "30")
        XCTAssertNil(engine.evaluateMath("triple h"))
        XCTAssertEqual(engine.evaluateMath("twenty one plus one"), "22")
        XCTAssertEqual(engine.evaluateMath("7% of 200"), "14")
        XCTAssertEqual(engine.evaluateMath("sqrt 9"), "3")
        XCTAssertNil(engine.evaluateMath("what is the capital of france"))
    }

    func testSqrt() {
        XCTAssertEqual(engine.evaluateMath("sqrt(144)"), "12")
    }

    func testSinZero() {
        XCTAssertEqual(engine.evaluateMath("sin(0)"), "0")
    }

    func testCosZero() {
        XCTAssertEqual(engine.evaluateMath("cos(0)"), "1")
    }

    func testLog10() {
        XCTAssertEqual(engine.evaluateMath("log(100)"), "2")
    }

    func testAbs() {
        XCTAssertEqual(engine.evaluateMath("abs(-42)"), "42")
    }

    // MARK: - Non-math rejection

    func testWhatsPrefixWithSymbolsAndCurlyApostrophe() {
        XCTAssertEqual(engine.evaluateMath("What’s 9+10"), "19")
        XCTAssertEqual(engine.evaluateMath("what's 9+10"), "19")
    }

    func testLogWithBaseInTheName() {
        XCTAssertEqual(engine.evaluateMath("log10(1000)"), "3")
        XCTAssertEqual(engine.evaluateMath("log2(8)"), "3")
        XCTAssertEqual(engine.evaluateMath("log(100)"), "2")
    }

    func testNonMathReturnsNil() {
        XCTAssertNil(engine.evaluateMath("hello world"))
    }

    func testEmptyReturnsNil() {
        XCTAssertNil(engine.evaluateMath(""))
    }

    func testSentenceReturnsNil() {
        XCTAssertNil(engine.evaluateMath("what is the population of canada"))
    }

    func testSingleNumberReturnsNil() {
        XCTAssertNil(engine.evaluateMath("42"))
    }

    // MARK: - Suggestions

    func testRandomSuggestion() {
        let suggestion = engine.randomSuggestion(useDefaults: true)
        XCTAssertFalse(suggestion.isEmpty)
    }

    func testRandomSuggestionNoDefaults() {
        let suggestion = engine.randomSuggestion(useDefaults: false)
        XCTAssertFalse(suggestion.isEmpty)
    }

    // MARK: - Network queries

    func testDDGQuery() async {
        let result = await engine.query("define nimble")
        switch result {
        case .text, .list:
            break
        case .error:
            break // network may not be available
        default:
            XCTFail("Expected text, list, or error result")
        }
    }

    // Regression: NSExpression parsed the valid prefix and silently ignored the
    // rest, so "2 + 2 banana" answered 4. The parser must consume the whole input.
    func testTrailingJunkIsRejected() {
        XCTAssertNil(engine.evaluateMath("2 + 2 banana"))
        XCTAssertNil(engine.evaluateMath("sqrt(9)log"))
        XCTAssertNil(engine.evaluateMath("sqrt(9) banana"))
        XCTAssertNil(engine.evaluateMath("6 * 7 and then some"))
    }

    // Regression: NSExpression(format:) threw an uncatchable
    // NSInvalidArgumentException on malformed input, crashing the app.
    func testMalformedInputDoesNotCrash() {
        XCTAssertNil(engine.evaluateMath("2 + 2 pi"))
        XCTAssertNil(engine.evaluateMath("2 +"))
        XCTAssertNil(engine.evaluateMath("(2 + 2"))
        XCTAssertNil(engine.evaluateMath("* 4"))
    }

    func testValidExpressionsStillEvaluate() {
        XCTAssertEqual(engine.evaluateMath("2 + 2"), "4")
        XCTAssertEqual(engine.evaluateMath("2 x 3"), "6")
        XCTAssertEqual(engine.evaluateMath("2 * pi"), "6.2831853072")
    }
}

// MARK: - Units and graphs

extension QueryEngineTests {
    func testConvertLength() {
        guard case .convert(let from, let to, let fu, let tu)? = engine.convert("5 miles to km") else { return XCTFail() }
        XCTAssertEqual(from, "5"); XCTAssertEqual(fu, "miles"); XCTAssertEqual(tu, "km")
        XCTAssertEqual(Double(to)!, 8.04672, accuracy: 1e-5)
    }

    func testConvertTemperatureAndHowMany() {
        XCTAssertEqual(QueryEngine.convertValue(100, from: "f", to: "c")!, 37.7778, accuracy: 1e-3)
        guard case .convert(let from, _, let fu, let tu)? = engine.convert("how many feet in 3 meters") else { return XCTFail() }
        XCTAssertEqual((from, fu, tu).0, "3"); XCTAssertEqual(fu, "meters"); XCTAssertEqual(tu, "feet")
    }

    func testConvertRejectsMixedDimensions() {
        XCTAssertNil(engine.convert("5 miles to kg"))
        guard case .convert(_, let f, let cu, let fu)? = engine.convert("180 c to f") else { return XCTFail() }
        XCTAssertEqual(f, "356"); XCTAssertEqual(cu, "°C"); XCTAssertEqual(fu, "°F")
        XCTAssertNil(engine.convert("who is the ceo of apple"))
    }

    func testGraphExpression() {
        XCTAssertEqual(engine.graphExpression("y = x^2"), "x^2")
        XCTAssertEqual(engine.graphExpression("plot sin(x)"), "sin(x)")
        XCTAssertNil(engine.graphExpression("2 + 2"))
        XCTAssertNil(engine.graphExpression("graph the economy"))
    }

    func testSampleGraphOffline() {
        guard case let .graph(_, pts)? = engine.sampleGraph("2x^2") else { return XCTFail("no graph") }
        XCTAssertEqual(pts.count, 201)
        XCTAssertEqual(pts.first?.y ?? 0, 200, accuracy: 1e-9)  // 2 * (-10)^2
        guard case let .graph(_, sine)? = engine.sampleGraph("3sin(x)") else { return XCTFail("no sine") }
        XCTAssertEqual(sine[100].y, 0, accuracy: 1e-9)
    }

    func testMathStepsFollowEvaluationOrder() {
        XCTAssertEqual(engine.mathSteps("(3+4)*2"), ["3+4 = 7", "7*2 = 14"])
        XCTAssertEqual(engine.mathSteps("3 + 4 * 2"), ["4*2 = 8", "3+8 = 11"])
        XCTAssertEqual(engine.mathSteps("2^3^2"), ["3^2 = 9", "2^9 = 512"])
    }

    func testMathStepsForPercentOfAndNaturalLanguage() {
        XCTAssertEqual(engine.mathSteps("15% of 240"), ["15/100 = 0.15", "0.15*240 = 36"])
        XCTAssertEqual(engine.mathSteps("whats three plus four times two"), ["4*2 = 8", "3+8 = 11"])
    }

    func testMathStepsFunctionCallIsOneStep() {
        XCTAssertEqual(engine.mathSteps("sqrt(16)+1"), ["sqrt(16) = 4", "4+1 = 5"])
    }

    func testNoStepsForSingleOperationOrBareNumber() {
        XCTAssertNil(engine.mathSteps("2 + 2"))
        XCTAssertNil(engine.mathSteps("42"))
        XCTAssertNil(engine.mathSteps("-(3+4)"))
        XCTAssertNil(engine.mathSteps("(3+4)/0"))
    }

    // The same queries as test/time-sensitive.test.js (web), so the three platforms agree.
    func testTimeSensitiveQueriesAreTrue() {
        let queries = [
            "who is the current prime minister of canada", "who is the ceo of apple", "current president of france",
            "latest iphone", "population of japan", "who holds the world record for the 100m", "who won the last world cup",
            "who is the premier of ontario", "what is the price of gold", "who is the mayor of vancouver",
            "who is the governor of california", "who is the leader of the opposition", "who is the champion of wimbledon",
            "what is the population of canada now", "what is the price of bitcoin today", "who is the incumbent senator for texas",
            "what is the newest macbook", "how much does a tesla model 3 cost",
        ]
        for q in queries { XCTAssertTrue(QueryEngine.isTimeSensitive(q), q) }
    }

    func testHistoryAndTimelessQueriesAreFalse() {
        let queries = [
            "who was the first president of the united states", "when was the eiffel tower built", "when was abraham lincoln born",
            "who discovered penicillin", "who invented the telephone", "what is the capital of france", "what is the speed of light",
            "how tall is mount everest", "who was the first prime minister of canada", "what year did world war 2 end",
        ]
        for q in queries { XCTAssertFalse(QueryEngine.isTimeSensitive(q), q) }
    }

    func testTimeSensitiveIgnoresCaseAndEmpty() {
        XCTAssertTrue(QueryEngine.isTimeSensitive("Who Is The CEO of Apple"))
        XCTAssertFalse(QueryEngine.isTimeSensitive(""))
    }
}
