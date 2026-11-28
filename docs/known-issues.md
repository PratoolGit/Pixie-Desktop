# Known Issues

## GPU Initialization on Linux CI
**Status**: Mitigated
**Description**: Electron fails to initialize GPU on headless Linux CI runners, causing viz_main_impl.cc errors.
**Workaround**: Added `--disable-gpu` flag for CI test runs. The application runs correctly on Windows with GPU acceleration.

## Camera Access in Headless Environment
**Status**: Known Limitation
**Description**: Camera access requires a physical camera or virtual camera device. In CI/headless environments, camera will not be available.
**Impact**: Vision features (hand/face tracking) will not work in CI. Application falls back gracefully.

## MediaPipe Model Downloads
**Status**: Resolved
**Description**: MediaPipe models must be downloaded at install time. Network issues during `npm ci` can cause missing models.
**Resolution**: Models are now bundled in the repository (renderer/vendor/models/). The fetch-vision.js script downloads them as fallback.

## PowerShell Host on Non-Windows
**Status**: By Design
**Description**: PowerShell host for Windows automation only works on Windows. On Linux/macOS, agent tasks fall back to limited implementations.
**Impact**: Full agent capabilities (window management, file ops, etc.) only available on Windows.

## Audio in Headless CI
**Status**: Known Limitation
**Description**: Text-to-speech and audio playback require audio output device. In CI, TTS will fail silently.
**Impact**: Voice features not testable in CI environment.

## Electron Cache Path
**Status**: Fixed
**Description**: Original package.json had Windows-specific cache path that broke Linux builds.
**Resolution**: Changed to `/tmp/electron-cache` for cross-platform compatibility.

## Code Signing in CI
**Status**: Disabled
**Description**: Code signing requires certificates not available in CI.
**Resolution**: Disabled `forceCodeSigning`, `verifyUpdateCodeSignature`, and `signAndEditExecutable` for CI builds.

## Single Instance Lock
**Status**: Working as Designed
**Description**: Application uses `app.requestSingleInstanceLock()` to prevent multiple instances. Second instance activates existing window.
**Note**: This is expected behavior, not a bug.

## HUD Overlay Permissions
**Status**: Platform Dependent
**Description**: Transparent, click-through, always-on-top overlay windows require special permissions on some Linux window managers.
**Impact**: HUD may not display correctly on all Linux desktop environments.