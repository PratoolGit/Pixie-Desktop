# Architecture Documentation

## Overview
Pixie-Desktop is an Electron-based desktop companion application with voice, vision, and agentic capabilities.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Window Mgmt │  │ IPC Handlers│  │ PowerShell Host     │  │
│  │ (main,      │  │ (settings,  │  │ (Windows automation │  │
│  │  island,    │  │  net:fetch,  │  │  via persistent    │  │
│  │  hud,       │  │  agent:run,  │  │  PS process)       │  │
│  │  overlay)   │  │  screen:cap) │  │                    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Preload Bridge  │
                    │   (contextBridge) │
                    └─────────┬─────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Renderer Process                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐   │
│  │  Vision  │  │  Voice   │  │Character │  │   Agent    │   │
│  │(MediaPipe)│  │(STT/TTS) │  │Animation │  │  Router    │   │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐   │
│  │ Gestures │  │   HUD    │  │   Swarm  │  │    UI      │   │
│  │          │  │          │  │  Visuals │  │            │   │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### Main Process (main.js)
- **Window Management**: Creates main window, island window, HUD overlay
- **Protocol Handler**: Custom `app://` protocol for serving renderer assets
- **IPC Handlers**: 
  - `settings:get/set` - Encrypted settings persistence
  - `net:fetch` - Network proxy to avoid CORS
  - `agent:run` - Execute agent tasks
  - `screen:capture` - Screen capture for vision
  - `hud:set/data` - HUD overlay control
- **PowerShell Host**: Persistent PowerShell process for fast Windows automation

### Renderer Process (renderer/js/)
- **main.js** - Bootstraps all systems
- **vision.js** - MediaPipe hand/face tracking
- **voice.js** - Speech-to-text (Groq), Text-to-speech (Google)
- **character.js** - Character animation, emotions, lip-sync
- **router.js** - Agent task routing, risk-based approvals
- **gestures.js** - Gesture recognition from hand landmarks
- **ui.js** - UI components, chat, settings
- **swarm.js** - Visual effects for agent tasks
- **store.js** - Reactive state management

### Preload (preload.js)
- Secure context bridge exposing `window.aether` API
- Allows renderer to communicate with main process

## Data Flow

### Voice Activation
1. Always-on listening via Web Speech API (Groq Whisper)
2. Wake word detection: "Hello Pixie"
3. Activates 20-second listening window
4. Voice commands routed to agent system

### Agent Task Execution
1. User input (voice/text) → Router
2. Router classifies intent → selects action
3. Risk assessment (safe/cautious/risky)
4. Confirmation flow based on risk level
5. Action executed via `window.aether.agent()`
6. Main process executes via PowerShell host
7. Result returned to renderer
8. Response spoken via TTS

### Vision Pipeline
1. Camera access via getUserMedia
2. MediaPipe HandLandmarker + FaceLandmarker in Web Workers
3. Landmarks processed for gestures
4. Gestures emitted as events
5. Main.js handles gesture events

## Security Model
- Context isolation enabled
- Node integration disabled
- Preload script as only bridge
- API keys encrypted at rest (safeStorage)
- Network requests proxied through main (no CORS in renderer)
- PowerShell host runs with user privileges only

## Build Configuration
- Electron 33.x
- electron-builder for packaging
- Windows: zip target (x64)
- No code signing for CI builds
- MediaPipe models bundled offline