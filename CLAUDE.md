# Pixie-Desktop - Personal Desktop Companion

## Project Overview
Pixie is a sweet, spicy, cute anime desktop companion that sees your gestures, hears your voice, and runs agentic tasks. Built with Electron, MediaPipe for vision, and custom agent system.

## Architecture
- **Main Process** (`main.js`): Electron main process with window management, IPC handlers, PowerShell host for Windows automation
- **Renderer** (`renderer/`): UI with character animation, voice, vision, gestures, agent routing
- **Preload** (`preload.js`): Secure bridge between main and renderer

## Key Features
- Voice activation ("Hello Pixie")
- Hand/face tracking via MediaPipe
- Gesture recognition (pinch, point, open_palm, fist, peace, thumbs_up, finger_heart, high_five, swipe, drag, precision_mode)
- Agent system with 35+ tasks across 8 categories
- Risk-based approval system (safe/cautious/risky)
- Character animations with emotion transitions
- Hindi/Hinglish language support
- Swarm visual effects for agent tasks

## Build & Run
```bash
npm ci          # Install dependencies
npm start       # Run in development
npm run dist    # Build Windows zip
```

## Project Memory Files
- CLAUDE.md (this file)
- TASKS.md (task tracking)
- CHANGELOG.md (version history)
- ARCHITECTURE.md (detailed architecture)
- docs/known-issues.md
- docs/decisions.md

## Recent Issues Fixed
1. GPU initialization errors on Linux CI - added `--disable-gpu` flag
2. Electron cache path fixed for cross-platform builds
3. Build workflow updated to use zip target only