import SwiftUI

/// Engine picker + key/model fields. Used by the macOS popover and the iOS preferences list.
struct AIEngineSettings: View {
    @Bindable var state: AppState

    var body: some View {
        Picker("Engine", selection: $state.ai.engine) {
            ForEach(AIEngine.allCases, id: \.self) { Text($0.displayName).tag($0) }
        }
        .onChange(of: state.ai.engine) { state.savePreferences() }

        if state.ai.engine != .nimble {
            if state.ai.engine.needsKey {
                SecureField("API key", text: $state.ai.apiKey)
                    .onSubmit { state.savePreferences() }
            }
            TextField("Model", text: $state.ai.model, prompt: Text(state.ai.engine.defaultModel))
                .onSubmit { state.savePreferences() }
            if state.ai.engine == .ollama {
                TextField("Server", text: $state.ai.baseURL, prompt: Text(AIEngine.ollama.defaultBaseURL))
                    .onSubmit { state.savePreferences() }
            }
            Text("Your key stays on this device and is sent only to \(state.ai.engine.displayName).")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
