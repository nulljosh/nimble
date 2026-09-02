import Foundation
import CoreGraphics

// Wolfram-shaped queries the LLM answers badly: unit conversion and graphing.
// Both run before the answer engine. Graph points come from Curvely's public API.
extension QueryEngine {

    // MARK: - Units

    /// ponytail: flat table in base units (m, kg, L, m/s, B, s); add rows, not code.
    private static let units: [String: (factor: Double, dim: String)] = [
        "mm": (0.001, "len"), "millimeter": (0.001, "len"), "millimeters": (0.001, "len"),
        "cm": (0.01, "len"), "centimeter": (0.01, "len"), "centimeters": (0.01, "len"),
        "m": (1, "len"), "meter": (1, "len"), "meters": (1, "len"), "metre": (1, "len"), "metres": (1, "len"),
        "km": (1000, "len"), "kilometer": (1000, "len"), "kilometers": (1000, "len"), "kilometre": (1000, "len"), "kilometres": (1000, "len"),
        "in": (0.0254, "len"), "inch": (0.0254, "len"), "inches": (0.0254, "len"),
        "ft": (0.3048, "len"), "foot": (0.3048, "len"), "feet": (0.3048, "len"),
        "yd": (0.9144, "len"), "yard": (0.9144, "len"), "yards": (0.9144, "len"),
        "mi": (1609.344, "len"), "mile": (1609.344, "len"), "miles": (1609.344, "len"),
        "g": (0.001, "mass"), "gram": (0.001, "mass"), "grams": (0.001, "mass"),
        "kg": (1, "mass"), "kilogram": (1, "mass"), "kilograms": (1, "mass"),
        "oz": (0.028349523125, "mass"), "ounce": (0.028349523125, "mass"), "ounces": (0.028349523125, "mass"),
        "lb": (0.45359237, "mass"), "lbs": (0.45359237, "mass"), "pound": (0.45359237, "mass"), "pounds": (0.45359237, "mass"),
        "ml": (0.001, "vol"), "milliliter": (0.001, "vol"), "milliliters": (0.001, "vol"),
        "l": (1, "vol"), "liter": (1, "vol"), "liters": (1, "vol"), "litre": (1, "vol"), "litres": (1, "vol"),
        "cup": (0.2365882365, "vol"), "cups": (0.2365882365, "vol"),
        "gal": (3.785411784, "vol"), "gallon": (3.785411784, "vol"), "gallons": (3.785411784, "vol"),
        "mph": (0.44704, "speed"), "kph": (0.277778, "speed"), "kmh": (0.277778, "speed"), "km/h": (0.277778, "speed"),
        "kb": (1e3, "data"), "mb": (1e6, "data"), "gb": (1e9, "data"), "tb": (1e12, "data"),
        "kilobytes": (1e3, "data"), "megabytes": (1e6, "data"), "gigabytes": (1e9, "data"), "terabytes": (1e12, "data"),
        "sec": (1, "time"), "second": (1, "time"), "seconds": (1, "time"),
        "min": (60, "time"), "minute": (60, "time"), "minutes": (60, "time"),
        "hr": (3600, "time"), "hour": (3600, "time"), "hours": (3600, "time"),
        "day": (86400, "time"), "days": (86400, "time"), "week": (604800, "time"), "weeks": (604800, "time"),
        "c": (0, "temp"), "celsius": (0, "temp"), "f": (0, "temp"), "fahrenheit": (0, "temp"), "k": (0, "temp"), "kelvin": (0, "temp"),
    ]

    /// "convert 100 f to c", "5 miles in km", "how many feet in 3 meters".
    func convert(_ input: String) -> QueryResult? {
        let q = input.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let patterns = [
            "^(?:convert\\s+)?(-?\\d+(?:\\.\\d+)?)\\s*°?\\s*([a-z/]+)\\s+(?:to|in|into|as)\\s+°?([a-z/]+)\\??$",
            "^how many\\s+([a-z/]+)\\s+(?:are\\s+)?in\\s+(-?\\d+(?:\\.\\d+)?)\\s*°?\\s*([a-z/]+)\\??$",
        ]
        for (i, p) in patterns.enumerated() {
            guard let m = q.range(of: p, options: .regularExpression) else { continue }
            let ns = q as NSString
            guard let re = try? NSRegularExpression(pattern: p),
                  let match = re.firstMatch(in: q, range: NSRange(m, in: q)) else { continue }
            let g = (1...3).map { ns.substring(with: match.range(at: $0)) }
            let (value, from, to) = i == 0 ? (g[0], g[1], g[2]) : (g[1], g[2], g[0])
            guard let v = Double(value), let out = Self.convertValue(v, from: from, to: to) else { return nil }
            return .convert(from: Self.trim(v), to: Self.trim(out), fromUnit: from, toUnit: to)
        }
        return nil
    }

    static func convertValue(_ v: Double, from: String, to: String) -> Double? {
        guard let a = units[from], let b = units[to], a.dim == b.dim else { return nil }
        if a.dim == "temp" {
            let kelvin: Double
            switch from.first { case "c": kelvin = v + 273.15; case "f": kelvin = (v - 32) * 5 / 9 + 273.15; default: kelvin = v }
            switch to.first { case "c": return kelvin - 273.15; case "f": return (kelvin - 273.15) * 9 / 5 + 32; default: return kelvin }
        }
        return v * a.factor / b.factor
    }

    private static func trim(_ v: Double) -> String {
        let s = String(format: "%.6f", v)
        return s.replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\.$", with: "", options: .regularExpression)
    }

    // MARK: - Graph

    /// "y = x^2", "plot sin(x)", "graph 2x+1" -> the bare expression, or nil.
    func graphExpression(_ input: String) -> String? {
        var q = input.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let hadVerb = q.range(of: "^(plot|graph|draw|sketch)\\s+", options: .regularExpression) != nil
        q = q.replacingOccurrences(of: "^(plot|graph|draw|sketch)\\s+", with: "", options: .regularExpression)
        let hadY = q.range(of: "^(y|f\\(x\\))\\s*=\\s*", options: .regularExpression) != nil
        q = q.replacingOccurrences(of: "^(y|f\\(x\\))\\s*=\\s*", with: "", options: .regularExpression)
        guard hadVerb || hadY, q.contains("x"),
              q.range(of: "^[0-9a-z+\\-*/^(). ]+$", options: .regularExpression) != nil else { return nil }
        return q
    }

    private struct Sample: Decodable { struct P: Decodable { let x: Double; let y: Double? }; let points: [P] }

    func sampleGraph(_ expr: String, session: URLSession = .shared) async -> QueryResult? {
        guard let url = URL(string: "https://curvely.heyitsmejosh.com/api/sample") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["expr": expr, "from": -10, "to": 10, "samples": 200])
        guard let (data, resp) = try? await session.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let s = try? JSONDecoder().decode(Sample.self, from: data) else { return nil }
        let pts = s.points.compactMap { p -> CGPoint? in
            guard let y = p.y, y.isFinite else { return nil }
            return CGPoint(x: p.x, y: y)
        }
        guard pts.count > 2 else { return nil }
        return .graph(expr: expr, points: pts)
    }
}
