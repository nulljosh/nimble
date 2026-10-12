import SwiftUI

/// Engine picker + key/model fields. Used by the macOS popover and the iOS preferences list.
struct AIEngineSettings: View {
    @Bindable var state: AppState

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
                TextField("Server", text: $state.ai.baseURL, prompt: Text(AIEngine.ollama.defaultBaseURL))
                    .onSubmit { state.savePreferences() }
            }
            Text("Your key stays on this device and is sent only to \(state.ai.engine.displayName).")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
