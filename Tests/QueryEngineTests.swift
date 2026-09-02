import XCTest
@testable import Nimble

final class QueryEngineTests: XCTestCase {
    let engine = QueryEngine()

    // MARK: - Basic arithmetic

    func testBasicAddition() {
        XCTAssertEqual(engine.evaluateMath("2 + 2"), "4")
    }

    func testMultiplication() {
        XCTAssertEqual(engine.evaluateMath("6 * 7"), "42")
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
        XCTAssertNil(engine.convert("who is the ceo of apple"))
    }

    func testGraphExpression() {
        XCTAssertEqual(engine.graphExpression("y = x^2"), "x^2")
        XCTAssertEqual(engine.graphExpression("plot sin(x)"), "sin(x)")
        XCTAssertNil(engine.graphExpression("2 + 2"))
        XCTAssertNil(engine.graphExpression("graph the economy"))
    }
}
