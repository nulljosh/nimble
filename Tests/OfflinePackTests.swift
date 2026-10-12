import XCTest
@testable import Nimble

/// The offline Wikipedia pack: the same lookup as docs/engine.js, on a five-entry fixture and on the real pack.
/// Answers come from the pack or are an honest miss. Never a guess.
/// Fixtures load from the test bundle (Tests/Fixtures is a resource). Reading ~/Documents from the test host
/// raises a privacy prompt that hangs the run, so nothing here touches the repo's docs folder.
final class OfflinePackTests: XCTestCase {
    private func fixture() throws -> OfflinePack {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "offline-pack", withExtension: "json"))
        let data = try Data(contentsOf: url)
        return OfflinePack(file: try JSONDecoder().decode(OfflinePack.File.self, from: data))
    }

    func testCapitalOfFranceNamesParis() throws {
        let pack = try fixture()
        let hit = try XCTUnwrap(pack.hits("capital of france").first)
        XCTAssertTrue(["France", "Paris"].contains(hit.entry.t), hit.entry.t)
        let answer = try XCTUnwrap(pack.answer("capital of france"))
        XCTAssertTrue(answer.text.contains("Paris"), answer.text)
        XCTAssertEqual(answer.url, "https://en.wikipedia.org/wiki/France")
    }

    func testWhoWroteHamletMapsToHamletOrShakespeare() throws {
        let pack = try fixture()
        let hit = try XCTUnwrap(pack.hits("who wrote hamlet").first)
        XCTAssertTrue(["Hamlet", "William Shakespeare"].contains(hit.entry.t), hit.entry.t)
        let answer = try XCTUnwrap(pack.answer("who wrote hamlet"))
        XCTAssertTrue(answer.text.contains("written by William Shakespeare"), answer.text)
    }

    func testGibberishAndStopWordsAreMisses() throws {
        let pack = try fixture()
        XCTAssertNil(pack.answer("zqxv blorptastic flimflam"))
        XCTAssertTrue(pack.hits("zqxv blorptastic flimflam").isEmpty)
        XCTAssertTrue(pack.hits("").isEmpty)
        XCTAssertTrue(pack.hits("who is the").isEmpty, "only stop words")
    }

    func testPackHitCarriesTextLinkAndBuildDate() throws {
        let pack = try fixture()
        let answer = try XCTUnwrap(pack.answer("what is water"))
        XCTAssertEqual(answer.title, "Water")
        XCTAssertEqual(answer.text, "Water is an inorganic compound with the chemical formula H2O.")
        XCTAssertEqual(answer.url, "https://en.wikipedia.org/wiki/Water")
        XCTAssertEqual(answer.builtAt, "2026-09-30")
        XCTAssertEqual(OfflinePack.asOfLabel(answer.builtAt), "Sep 30")
    }

    func testAsOfLabelDoesNotShiftTheDay() {
        XCTAssertEqual(OfflinePack.asOfLabel("2026-10-12"), "Oct 12")
        XCTAssertNil(OfflinePack.asOfLabel("not a date"))
    }

    func testRelationShapesParse() {
        XCTAssertEqual(OfflinePack.relation("capital of france")?.subject, "france")
        XCTAssertEqual(OfflinePack.relation("What's the capital city of the Netherlands?")?.subject, "Netherlands")
        XCTAssertEqual(OfflinePack.relation("population of japan")?.subject, "japan")
        XCTAssertNil(OfflinePack.relation("what is water"))
        // A "when ... born" question needs the verb and a year in the same sentence.
        let born = OfflinePack.relation("when was Ada Lovelace born")
        XCTAssertEqual(born?.subject, "Ada Lovelace")
        XCTAssertEqual(born?.word("Lovelace was born in 1815."), true)
        XCTAssertEqual(born?.word("A German-born physicist of the 1900s."), false, "a birth verb with no year")
        XCTAssertEqual(born?.word("Lovelace was a mathematician in 1843."), false, "a year with no birth verb")
    }

    func testGunzipRejectsGarbage() {
        XCTAssertNil(OfflinePack.gunzip(Data([1, 2, 3])))
        XCTAssertNil(OfflinePack.gunzip(Data(repeating: 0x1f, count: 40)))
    }

    /// The real pack, installed the way the app installs a download. Answers must name the answer or be a miss.
    @MainActor
    func testRealPackInstallsAndAnswers() async throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "wikipedia-top-v1.json", withExtension: "gz"))
        let gz = try Data(contentsOf: url)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("offline-pack-test-\(UUID().uuidString)")
        let store = OfflinePackStore(directory: dir)
        defer { store.remove(); try? FileManager.default.removeItem(at: dir) }

        try await store.install(gz: gz)
        XCTAssertEqual(store.phase, .ready)
        XCTAssertEqual(store.pack?.entries.count, 9000)

        let paris = try XCTUnwrap(store.answer("capital of france"))
        XCTAssertTrue(paris.text.contains("Paris"), paris.text)
        let apple = try XCTUnwrap(store.answer("who founded apple"))
        XCTAssertTrue(apple.text.contains("Jobs") || apple.text.contains("Wozniak"), apple.text)
        XCTAssertNil(store.answer("zqxv blorptastic flimflam"))

        store.remove()
        XCTAssertNil(store.pack)
        XCTAssertNil(store.answer("capital of france"))
    }
}
