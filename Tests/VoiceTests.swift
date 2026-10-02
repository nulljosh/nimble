import XCTest
import Speech
import AVFoundation
@testable import Nimble

@MainActor
final class VoiceTests: XCTestCase {
    /// Not asked yet: not ready to listen, but the button still shows so the tap can ask. No prompt here.
    func testNotDeterminedIsNotAvailableButOffered() {
        let voice = Voice(permission: { .notDetermined })
        XCTAssertFalse(voice.available)
        _ = voice.offered  // reading it must not crash or prompt
        XCTAssertFalse(voice.listening)
        XCTAssertEqual(voice.transcript, "")
    }

    /// The real host, whatever the machine says: reading never prompts and never listens.
    func testSystemStatusReadIsQuiet() {
        let voice = Voice()
        if voice.permission != .granted { XCTAssertFalse(voice.available) }
        XCTAssertFalse(voice.listening)
    }

    func testDeniedHidesTheButton() {
        let voice = Voice(permission: { .denied })
        XCTAssertFalse(voice.available)
        XCTAssertFalse(voice.offered)
        voice.start()  // denied: a no-op, no prompt, no mic
        XCTAssertFalse(voice.listening)
    }

    func testStopWhileIdleDoesNothing() {
        let voice = Voice(permission: { .granted })
        var finished = false
        voice.onFinish = { _ in finished = true }
        voice.stop()
        voice.cancel()
        XCTAssertFalse(finished)
        XCTAssertFalse(voice.listening)
    }

    func testPermissionNeedsBothSpeechAndMic() {
        XCTAssertEqual(Voice.combine(speech: .authorized, mic: .authorized), .granted)
        XCTAssertEqual(Voice.combine(speech: .authorized, mic: .notDetermined), .notDetermined)
        XCTAssertEqual(Voice.combine(speech: .notDetermined, mic: .notDetermined), .notDetermined)
        XCTAssertEqual(Voice.combine(speech: .denied, mic: .authorized), .denied)
        XCTAssertEqual(Voice.combine(speech: .authorized, mic: .restricted), .denied)
    }
}
