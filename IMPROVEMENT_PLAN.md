# Pixie-Desktop Improvement Plan

## 1. Performance Optimizations (Light Speed)
- [x] Optimize MediaPipe worker pipeline - reduce frame latency (PARTIAL - frame skipping implemented)
- [x] Implement requestIdleCallback for non-critical work (vision.js - idle queue)
- [ ] Add caching layer for LLM responses
- [x] Optimize OneEuro filter params (beta 0.045, differentiated x/y/z)
- [x] Reduce HUD update frequency when not needed (throttled ~30fps)
- [x] Implement frame skipping when no hands/face detected (progressive up to 500ms/2fps)
- [ ] Parallel TTS synthesis with streaming playback

## 2. Character Role Enhancement
- [ ] Add personality profiles (caring, playful, professional, etc.)
- [ ] Context-aware responses based on time, activity
- [ ] Emotional state persistence
- [ ] Proactive suggestions based on user patterns
- [ ] Better greeting/goodbye rituals
- [x] Emotion transitions with cross-fade (character.js)
- [x] Gaze/attention with smooth pursuit (character.js)
- [x] Micro-expressions: breathing, micro-saccades (character.js)
- [x] Voice-driven body: squash, shoulder bounce, neck tension (character.js)
- [x] Lip-sync coarticulation (character.js)

## 3. Voice-Activated Task Addition
- [x] Parse "add task [name] that [description]" from voice
- [x] Store custom tasks in macros/bindings
- [x] Voice confirmation for new tasks
- [x] Task editing/deletion by voice

## 4. Swarm-Style Visual Agentic Tasks
- [x] Visual swarm particles for task execution (swarm.js)
- [x] Screen region highlighting with animated borders (swarm.js)
- [x] Task progress rings on target elements (swarm.js)
- [x] Agent "swarm" visualization during multi-step tasks (swarm.js)
- [x] Minimal, clean UI overlays (swarm.js)

## 5. WebGL Hand Tracking Improvements
- [x] Remove: smile detection, emotion animations (user_smile, user_tired, etc.) (vision.js, main.js)
- [x] Keep: pinch, point, open_palm, fist, peace, thumbs_up, finger_heart, high_five
- [x] Add: camera-relative touch tracking (air touch) (vision.js)
- [x] Add: drag/swipe gestures (vision.js)
- [x] Add: precision mode (pinch + hold = cursor) (vision.js)
- [x] Visual: clean hand skeleton, fingertip glow on action (glove.js)

## 6. Approval System Overhaul
- [x] Remove mandatory confirmations for low-risk actions (router.js - SAFE tier no confirm)
- [x] Risk tiers: safe (no confirm), cautious (quick confirm), risky (full confirm) (router.js)
- [x] Context-aware: repetitive actions become auto-approved (router.js - frequency tracking)
- [x] Visual indicator of risk level before action (router.js - emoji in caption)

## 7. Hindi + Hinglish Language Support
- [x] Add Hindi (Devanagari) and Hinglish (Latin script) to STT vocab (store.js - LANGUAGES)
- [x] Add Hindi TTS voice (Google Cloud: hi-IN-Neural2-A/B) (voice.js - VOICES array)
- [x] Add Hinglish TTS (transliteration + English voice) (voice.js - voiceForLang)
- [x] Hindi/Hinglish system prompts (voice.js)
- [x] Language detection and auto-switch (voice.js - uiLang setting)
- [x] STT language parameter support (voice.js - transcribe with lang hint)

## 8. 35+ New Agentic Tasks
### System & Window Management (5)
- [x] minimize_window, maximize_window, restore_window, close_window, list_windows

### File Operations (5)
- [x] create_file, read_file, write_file, delete_file, list_folder

### Web & Search (5)
- [x] scrape_page, extract_links, summarize_page, search_site, bookmark_page

### Productivity (5)
- [x] create_calendar_event, list_calendar, send_email, create_todo, list_todos

### Media & Communication (5)
- [x] play_music, control_media, send_message, make_call, screenshot_region

### Development (5)
- [x] run_command, git_status, git_commit, open_editor, view_logs

### Smart Home / IoT (3)
- [x] control_light, get_sensor, set_thermostat (stubs for future Home Assistant integration)

### AI-Powered (5)
- [x] analyze_image, generate_code, explain_code, refactor_code, write_tests

---

## Next Priority Implementation Order:
1. **Voice-Activated Task Addition** (voice commands for custom tasks)
2. **Character Personality Profiles** (caring/playful/professional modes)
3. **LLM Response Caching** (performance)
4. **Parallel TTS Streaming** (performance)
5. **Productivity integrations** (calendar, email, todos - need backend APIs)
6. **Smart Home / IoT** (Home Assistant integration)
7. **Development tooling** (git, editor integration)</think>
<tool_call>
<function=mcp__instabox__exec>
<parameter=cmd>
cd /data/home/workspaces/Pixie-Desktop && git status