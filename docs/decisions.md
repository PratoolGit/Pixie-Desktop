# Architecture Decision Records

## ADR-001: Electron for Desktop Application
**Date**: 2024-11-20
**Status**: Accepted
**Context**: Need cross-platform desktop app with system integration
**Decision**: Use Electron with Node.js for main process, Chromium for renderer
**Consequences**: 
- Large bundle size (~100MB)
- Access to Node.js APIs in main process
- Web technologies for UI
- Single codebase for Windows/macOS/Linux

## ADR-002: MediaPipe for Vision
**Date**: 2024-11-20
**Status**: Accepted
**Context**: Need hand/face tracking in browser
**Decision**: Use @mediapipe/tasks-vision with WebAssembly
**Consequences**:
- Runs entirely in renderer (no native modules)
- Good performance via WebAssembly
- Models must be bundled for offline use
- Limited to browser-supported features

## ADR-003: Persistent PowerShell Host
**Date**: 2024-11-20
**Status**: Accepted
**Context**: Windows automation tasks need to be fast (<100ms)
**Decision**: Spawn persistent PowerShell process, communicate via stdin/stdout JSON
**Consequences**:
- ~10ms per task after warmup
- Complex PowerShell script embedded in main.js
- Windows-only feature
- Requires careful error handling and process management

## ADR-004: Custom app:// Protocol
**Date**: 2024-11-20
**Status**: Accepted
**Context**: Need to serve renderer assets securely without file:// protocol
**Decision**: Register custom protocol with protocol.handle()
**Consequences**:
- Assets served from memory/fs with proper MIME types
- Works in packaged app (asar) and development
- Secure: prevents directory traversal
- Enables CSP-compliant loading

## ADR-005: Risk-Based Approval System
**Date**: 2024-11-25
**Status**: Accepted
**Context**: Agent actions need user consent but not all actions are equal risk
**Decision**: Three-tier risk system (safe/cautious/risky) with auto-approval learning
**Consequences**:
- Safe actions execute immediately
- Cautious actions show brief confirmation (3s timeout)
- Risky actions require explicit confirmation (45s timeout)
- Frequency tracking enables auto-approval for repeated safe actions

## ADR-006: Reactive Store with Proxies
**Date**: 2024-11-20
**Status**: Accepted
**Context**: Need reactive state management without external dependencies
**Decision**: Custom Proxy-based store in store.js
**Consequences**:
- Zero dependencies
- Automatic dependency tracking
- onChange subscriptions
- Simple API: S.key, S.key = value

## ADR-007: Offline-First Model Bundling
**Date**: 2024-11-20
**Status**: Accepted
**Context**: Application must work without internet after install
**Decision**: Bundle MediaPipe models and WASM in renderer/vendor/
**Consequences**:
- Larger package size (~12MB for models)
- Works completely offline
- Fetch-vision.js downloads as fallback during install
- Models version-pinned for reproducibility

## ADR-008: Hindi/Hinglish Language Support
**Date**: 2024-11-26
**Status**: Accepted
**Context**: Target users include Hindi/Hinglish speakers
**Decision**: Add Devanagari and Latin-script Hindi to STT vocab, Google Cloud TTS voices
**Consequences**:
- STT language hints for Groq Whisper
- Transliteration for Hinglish TTS
- System prompts in Hindi/Hinglish
- Auto-detection based on user input

## ADR-009: Swarm Visual Effects
**Date**: 2024-11-26
**Status**: Accepted
**Context**: Need visual feedback for agent task execution
**Decision**: Particle-based swarm system with screen region highlighting
**Consequences**:
- Canvas-based animation in swarm.js
- Highlights target UI elements
- Progress rings for multi-step tasks
- Performance optimized with requestAnimationFrame

## ADR-010: Build for Windows Zip Only (CI)
**Date**: 2026-11-28
**Status**: Accepted
**Context**: GitHub Actions Linux runners cannot build signed Windows executables
**Decision**: Use zip target only, disable all code signing for CI
**Consequences**:
- Faster CI builds
- No certificate management needed
- Artifact is portable zip (no installer)
- Users extract and run directly
- Local builds can still create NSIS installer