import SwiftUI

/// Engine picker + key/model fields. Used by the macOS popover and the iOS preferences list.
struct AIEngineSettings: View {
    @Bindable var state: AppState
    #if os(macOS)
    @State private var samantha = SamanthaStatus()
    #endif

    var body: some View {
        Picker("Engine", selection: $state.ai.engine) {
            // On device only appears where Apple Intelligence is ready to answer.
            ForEach(AIEngine.allCases.filter { $0 != .onDevice || OnDeviceAnswers.isAvailable }, id: \.self) {
                Text($0.displayName).tag($0)
            }
        }
        .onChange(of: state.ai.engine) { state.savePreferences() }

        if state.ai.engine != .nimble && state.ai.engine != .onDevice {
            if state.ai.engine.needsKey {
                SecureField("API key", text: $state.ai.apiKey)
                    .onSubmit { state.savePreferences() }
            }
            TextField("Model", text: $state.ai.model, prompt: Text(state.ai.engine.defaultModel))
                .onSubmit { state.savePreferences() }
            if state.ai.engine == .ollama || state.ai.engine == .samantha {
                TextField("Server", text: $state.ai.baseURL, prompt: Text(state.ai.engine.defaultBaseURL))
                    .onSubmit { state.savePreferences() }
            }
            #if os(macOS)
            if state.ai.engine == .samantha {
                SamanthaStatusRow(status: samantha)
            }
            #endif
            Text("Your key stays on this device and is sent only to \(state.ai.engine.displayName).")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#if os(macOS)
/// Samantha's live state: a dot, whether oMLX answers, the model it serves, and the last measured answer time.
private struct SamanthaStatusRow: View {
    let status: SamanthaStatus

    private var isRunning: Bool {
        if case .running = status.state { return true }
        return false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Circle()
                    .fill(isRunning ? Color.green : Color.secondary)
                    .frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 1) {
                    switch status.state {
                    case .running(let model):
                        Text(String(localized: "Samantha is running"))
                        Text(model)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    case .unknown:
                        Text(String(localized: "Checking Samantha"))
                            .foregroundStyle(.secondary)
                    case .down:
                        Text(String(localized: "Samantha is not running"))
                    }
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                if let latency = status.lastLatency {
                    Text(String(localized: "Last answer: \(String(format: "%.1fs", latency))"))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if !isRunning, status.state != .unknown {
                    Button(String(localized: "Start")) { status.start() }
                }
                Button(String(localized: "Test")) { Task { await status.ping() } }
            }
        }
        .task { await status.refresh() }
    }
}
#endif
