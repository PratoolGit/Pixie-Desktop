# Pixie

A friendly, sweet and cute anime desktop companion for Windows, animated from your original artwork. She wakes up when you open the app, moves her mouth
when she talks, reacts to your gestures and expressions through the webcam, listens for **"Hello Pixie"**, and runs
agentic tasks on your PC: clicking buttons (after highlighting them and asking), typing where your cursor is,
opening apps and sites, searching, scrolling, timers, notes and more. Minimize the window and she becomes a
dynamic island at the top-centre of the screen.

## Get the Windows installer (no local setup)

1. Create a GitHub repository and upload everything in this folder.
2. Push a tag: `git tag v1.0.0 && git push origin v1.0.0`. The **Build Windows installer** workflow builds
   `Pixie-Setup-1.0.0.exe` and attaches it to a GitHub Release. Or use Actions ▸ *Run workflow* and download the artifact.
3. Run the installer. SmartScreen may warn because the app is not code-signed: *More info ▸ Run anyway*.

Free for public repositories (and within the free monthly allowance for private ones).

## First-run setup (30 seconds)

Pixie works offline for built-in commands and the chat box. For her **ears and brain**, add one free key:
Settings ▸ **AI providers** ▸ **Groq Cloud** ▸ paste a key from console.groq.com. The default routing already uses it for chat,
agent tasks, vision and speech recognition (Whisper), so "Hello Pixie" starts working immediately.

## Dashboard

Only: the settings gear (top right), Pixie with her animated halo, a cherry-blossom petal background (petals only, no tree), a 2 cm camera preview
(bottom left) and the **Ask Pixie** chat box (bottom). Replies appear as a speech bubble above the chat box.

## Live animation (original art)

Her original drawings are no longer static pictures: a WebGL mesh warp (Live2D-style) deforms the artwork every frame, continuously, including while she speaks. Head turn and nod, hair sway with follow-through, ahoge, ribbons, sleeves, breathing, a jaw that drops with the open mouth, eye blinks and gaze that follows you. The animated lips are warped by the same mesh, so they stay attached to her face. If WebGL is unavailable she falls back to the simpler renderer automatically.

**Real video:** drop transparent `.webm`/`.mp4` loops into `assets/anim/<emotion>.webm` (see `assets/anim/README.txt`) and that emotion plays your video instead of the still. Works for any of her 44 emotions or any of the 13 drawings.

## Screen vision (improved)

Full-resolution capture (up to 1800 px for text), with modes for the whole screen, the active window, or the area around your pointer. Say: "what's on my screen", "read the text on my screen", "describe this window", "what am I pointing at", "explain this error", "where is the Send button" (she finds it visually, highlights it and offers to click it; also used automatically when a button has no accessibility name), or ask anything about the screen.

## More agent tasks

Visual find-and-click, read screen text, ask about the screen, describe window / pointer area, type into a named field ("type hello in the search box"), copy to clipboard, set volume to an exact level, snap window left/right/up/down, weather, draft an email (opens your mail app), open latest download, explain selection, remind me at a clock time, read my notes, scroll to top/bottom, zoom in/out. Accuracy: natural phrasing is cleaned up ("hey Pixie, could you please open Spotify"), number words become digits, and misheard app names are corrected ("spotty fy" opens Spotify).

## Light-touch pinch

Pinch detection now uses the real 3D distance between thumb and index fingertips, smoothed and calibrated to how far apart *your* fingers open, with a pressure level. Even a gentle fingertip touch registers (a soft tick sounds and a ring tightens on the cursor); quick touch = click, held touch = drag. Release has hysteresis so it does not flicker.

## Chat history sidebar

The button at the **top-left** opens a sidebar with **New chat**, a search box and your **Chat history** grouped by Today / Yesterday / Previous 7 days / Older. Click a chat to open its full conversation beside the sidebar and continue it (her memory is restored from that chat); hover a chat to rename or delete it. Everything you say, type or hear her reply is saved on this PC. The app always starts on a fresh chat.

## NVIDIA NIM provider

Settings ▸ AI providers ▸ **NVIDIA NIM**: paste a key from build.nvidia.com (starts with `nvapi-`; free credits). It is OpenAI-compatible, so it works for chat, agent tasks and screen vision, and is already set as the last fallback for chat and agent, and the second fallback for vision. Pick any NIM model in Task routing (for example `meta/llama-3.3-70b-instruct`, `nvidia/llama-3.1-nemotron-70b-instruct`, `meta/llama-3.2-90b-vision-instruct`).

## What's new in this version

- **Real lip-sync on your original art.** Her original mouth is removed from the illustration and replaced by animated lips (A, E, I, O, U, closed, teeth, tongue) that follow the *audio clock*: the loudness of the actual sound plus a vowel timeline built from the words. Ten of her 13 drawings support this; the three with hands covering the mouth (shy, scared, sleepy) swap open/closed drawings instead.
- **No more dead air.** While a reply is being generated she shows a "getting ready" animation and bouncing dots; the caption and her voice start together, the moment sound begins.
- **Speaking body language.** Emphasis nods on stressed words, head tilts between phrases, a slight lean-in, idle gaze drift.
- **Speed.** Sentences are synthesized in parallel (the first chunk is kept short), common replies are pre-cached and replay instantly, connections are pre-warmed, speech endpointing is faster, and a "heard you" chime and thinking animation play the instant you stop talking.
- **Glove hands.** Your tracked hands appear as cute paw gloves (in the camera preview and on the full-screen HUD overlay) instead of a skeleton.
- **Better tracking.** 3D joint-angle pose detection (works at any distance or rotation), stable left/right hand identity, lighter frames sent to the background vision worker.
- **Air touch.** Point to aim a real cursor, pinch to click, hold the pinch to drag. The aim point is latched before the pinch so clicks land where you aimed, with magnetic snapping to real buttons.
- **Faster, smarter agent.** A persistent PowerShell host (compiled once) replaces a new process per task; screen scans are batched; matching understands synonyms, "the second button", "search box", and asks the AI to choose when names are ambiguous. New: double/right click, "click this", switch/maximize/minimize/close window, search or read your selection aloud, "press down 3 times".
- **Island** shows her whole character at all times and grows when expanded.

## Her animation (original art)

Pixie is animated from the original illustrations only. Each of her 44 emotions combines one of your 13 drawings with its own
motion (bounce, shiver, sob, tilt, nod, float…), props (❓ 💡 💢 ⚙️ ✅), particles (hearts, tears, steam, Zzz, confetti), and a tint. She switches to
*listening*, *working*, *success* or *oops* as she hears you and runs tasks. While talking she swaps between the open-mouth and
closed-mouth drawings in time with her voice (with a small squash-and-stretch). Idle, she looks around, hums, and sometimes yawns on her own.

## Minimized (dynamic island)

A slim pill at the top-centre: her face, one short line, and a mic dot. Hover to type a request or tap Yes/No. Replies are kept to a few words,
and the full agent (speech recognition, clicking, typing, searching…) keeps working.

## Talking to her

- Say **"Hello Pixie"** (no clicking). She stays listening ~20 s after each exchange. Mic dot: green = listening, pink = awake.
- Or type in the chat box. Hold a fist to wake her instantly.
- Screen control: *"click the send button"* → she highlights it and asks **"Use this button?"**. Say yes (or 👍, a nod, or tap Yes). *"No"* shows the next match.
- Writing: *"type hello world"* or *"write an email to my boss saying I'm late"* (AI) → she highlights your text box and asks before typing at the cursor.

### Agent tasks

Local (no AI needed): open apps/sites · web search · YouTube · click a button by name · type at the cursor · keyboard shortcuts
(copy, paste, undo, ctrl+…) · scroll · timers/reminders · notes (Documents/Pixie) · calculator · open folders · volume/media ·
screenshot · minimize all · lock · battery · clipboard · focus timer.
With an AI key: compose & write · summarize / translate / rewrite your selected text · describe your screen · free-form requests
(she can chain up to 4 actions) · chat with memory.

## Settings

Character & listening (speech language, friendly check-ins) · **Voice (Google TTS)** with 5 cute voices (Mochi, Bubbles, Candy, Berry, Sprinkle), free or Cloud mode · AI providers
& keys · **Task routing** with primary, fallback and fallback 2 per task · **Gesture bindings & recorder** (wink → open Spotify;
record your own gestures with 3-sample DTW) · **Face ID** · **Macros** · **Spatial HUD & performance** · Test lab (all 44 emotions) ·
Studio view (wide two-column layout).

Windows system voices are not used. If Google TTS is unreachable she stays silent (lips still move, text still shows).

## Honest notes

- The live mesh-warp, lip-sync, pinch logic and agent flows were tested here; the Windows-only parts (PowerShell host, UI scanning, window snapping, volume, air-touch cursor) and real camera tracking could not be run in the Linux sandbox. Please test on Windows.
- Screen vision quality depends on the vision model you choose; coordinates from visual find-and-click are model estimates, so she always highlights and asks before clicking.

- The persistent PowerShell host, UI scanning, air-touch cursor and window control are written for Windows and could not be run in the Linux build sandbox. If the host fails, Pixie automatically falls back to the slower per-task PowerShell path. Please test on Windows.
- Hand/face accuracy and latency depend on your camera, light and PC; they were not measurable here.

- Screen control, typing and shortcuts use Windows UI Automation and SendKeys through PowerShell. They were written to Windows
  APIs but **could not be run in the Linux build sandbox**; test on Windows and report oddities. Apps that expose no accessibility
  tree (some games, custom-drawn UIs) cannot be clicked by name.
- "Google voice (free)" uses Google Translate's unofficial endpoint: no key, but it can change or rate-limit. For stable quality use Cloud TTS.
- Speech accuracy: audio is cleaned (rumble filter + level normalisation), Whisper gets vocabulary hints (your name, app names, your macros), low-confidence/hallucinated segments are dropped, and a second, larger Whisper model is the fallback. Choose your speech language (or Auto) in settings.
- Always-on listening sends short speech clips to your STT provider (Groq free tier has rate limits). Nothing is sent while idle/silent.
- Camera frames stay on your PC. Face ID is a convenience greeting, not security.
- Latency depends on your hardware; vision runs in a background worker with zero-copy frame transfer and falls back to the main thread automatically.

## Develop

```
npm install   # copies MediaPipe and downloads the two vision models
npm start
npm run dist  # Windows installer in dist/
```
