# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-28

### Added
- Initial release of Pixie desktop companion
- Voice activation with "Hello Pixie" wake word
- Hand and face tracking via MediaPipe
- Gesture recognition system (pinch, point, open_palm, fist, peace, thumbs_up, finger_heart, high_five, swipe, drag, precision_mode)
- Character animation system with emotion transitions
- Agent system with 35+ tasks across 8 categories:
  - System & Window Management (5)
  - File Operations (5)
  - Web & Search (5)
  - Productivity (5)
  - Media & Communication (5)
  - Development (5)
  - Smart Home / IoT (3)
  - AI-Powered (5)
- Risk-based approval system (safe/cautious/risky)
- Hindi/Hinglish language support
- Swarm visual effects for agent tasks
- Dynamic island mode for minimized state
- HUD overlay for spatial awareness
- PowerShell host for Windows automation

### Changed
- Fixed GPU initialization errors on Linux CI
- Updated electron cache path for cross-platform builds
- Disabled code signing for CI builds
- Updated build workflow to use zip target only

### Fixed
- Electron builder configuration for Linux CI builds
- Package.json syntax issues
- MediaPipe model download and bundling