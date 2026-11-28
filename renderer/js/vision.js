// Webcam hand + face tracking (MediaPipe Tasks, GPU with CPU fallback), One-Euro smoothing,
// gesture state machine and facial-expression detectors. Locked to the camera's own frame callback.
import { S } from './store.js';
import { drawGlove } from './glove.js';
const W = 640, H = 480;
export const Vision = { ready: false, running: false, fps: 0, latency: 0, error: null, hands: 0, face: false, previewCanvas: null, video: null, userMood: 'neutral', mode: 'off', faceEvery: 3, faceFeat: [1, 1, 0, 1, 1, 1, 0, 0] };
const bus = new EventTarget();
export const on = (n, fn) => bus.addEventListener(n, e => fn(e.detail));
export const emit = (n, d = {}) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));

// ---------- One-Euro filter (fc_min 1.15 Hz, beta 0.045 on percent-of-frame units, d_cutoff 1 Hz) ----------
const alpha = (te, fc) => 1 / (1 + 1 / (2 * Math.PI * te * fc));
export class OneEuro {
  constructor(fcmin = 1.15, beta = 0.045, dcut = 1) { Object.assign(this, { fcmin, beta, dcut, t: null, px: 0, x: 0, dx: 0 }); }
  filter(v, t) {
    if (this.t === null) { this.t = t; this.px = this.x = v; return v; }
    const te = Math.max((t - this.t) / 1000, 1e-3);
    const ad = alpha(te, this.dcut), raw = (v - this.px) / te;
    this.dx = ad * raw + (1 - ad) * this.dx;
    const a = alpha(te, this.fcmin + this.beta * Math.abs(this.dx));
    this.x = a * v + (1 - a) * this.x; this.px = v; this.t = t; return this.x;
  }
}
// Reduced filter count: only filter x/y for most landmarks, z is less critical for gestures
// 21 landmarks * 2 (x,y) + 21 landmarks * 1 (z, lightly filtered) = 63 filters per hand
const filters = [0, 1].map(() => Array.from({ length: 63 }, (_, i) => {
  // x, y get full OneEuro; z gets lighter filter (higher fc_min, lower beta)
  if (i % 3 === 2) return new OneEuro(2.0, 0.02, 1.5);
  return new OneEuro(1.15, 0.045, 1);
}));
const faceFilters = Array.from({ length: 6 }, () => new OneEuro(1.5, 0.05));  // nose x/y + a few stabilisers
const smoothHand = (lm, k, t) => lm.map((p, i) => ({
  x: filters[k][i * 3].filter(p.x * 100, t) / 100,
  y: filters[k][i * 3 + 1].filter(p.y * 100, t) / 100,
  z: filters[k][i * 3 + 2].filter(p.z * 100, t) / 100
}));

// ---------- geometry ----------
const d = (a, b) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
// 3D joint-angle classifier on world landmarks (metres): independent of hand size, distance and rotation. Hysteresis keeps poses from flickering.
const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], sub3 = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z], len3 = u => Math.hypot(u[0], u[1], u[2]) || 1e-6;
const ang = (a, b, c) => { const u = sub3(a, b), v = sub3(c, b); return Math.acos(Math.max(-1, Math.min(1, dot3(u, v) / (len3(u) * len3(v))))) * 180 / Math.PI; };
const extMem = [[false, false, false, false, false], [false, false, false, false, false]], pinchMem = [false, false], pinchEma = [null, null], openRef = [1, 1], touchSince = [0, 0];

// Track pinch position and movement for drag / precision mode
const pinchPos = [{ x: 0, y: 0, t: 0, moved: false }, { x: 0, y: 0, t: 0, moved: false }];
const palmVel = [{ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 0 }];

function classify(lm, wl, k) {
  const w = wl || lm, palm2 = Math.hypot((lm[0].x - lm[9].x) * W, (lm[0].y - lm[9].y) * H) || 1, palmW = len3(sub3(w[0], w[9])) || 1e-6;
  const ext = [], mem = extMem[k];
  const th = Math.min(ang(w[1], w[2], w[3]), ang(w[2], w[3], w[4]));
  ext[0] = mem[0] ? th > 138 : th > 152;
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach(([m, p, d, t], i) => { const a = Math.min(ang(w[m], w[p], w[d]), ang(w[p], w[d], w[t]) + 12); ext[i + 1] = mem[i + 1] ? a > 128 : a > 156; });
  extMem[k] = ext.slice();
  // light-touch pinch: 3D thumb-tip/index-tip distance, smoothed, relative to this hand's own open-hand distance, with hysteresis
  const raw = len3(sub3(w[4], w[8])) / palmW, now = performance.now();
  pinchEma[k] = pinchEma[k] === null ? raw : pinchEma[k] * .35 + raw * .65; const pr = pinchEma[k];
  openRef[k] = Math.max(.55, Math.min(1.6, pr > openRef[k] ? openRef[k] * .9 + pr * .1 : openRef[k] * .998 + pr * .002));   // learns how far apart your fingers are when open
  const rel = pr / openRef[k], pinchNow = pinchMem[k] ? (pr < .42 || rel < .42) : (pr < .3 || rel < .3), level = Math.max(0, Math.min(1, (.42 - pr) / .3));
  if (pinchNow && !pinchMem[k]) touchSince[k] = now; if (!pinchNow && pinchMem[k] && now - touchSince[k] < 320) emit('pinch_tap', { hand: k, level });
  pinchMem[k] = pinchNow;

  // Track pinch position (midpoint of thumb/index tips in screen space)
  const pinchX = (lm[4].x + lm[8].x) * 0.5;
  const pinchY = (lm[4].y + lm[8].y) * 0.5;
  if (pinchNow) {
    const pp = pinchPos[k];
    if (pp.t === 0) { pp.x = pinchX; pp.y = pinchY; pp.t = now; pp.moved = false; }
    else {
      const dist = Math.hypot((pinchX - pp.x) * W, (pinchY - pp.y) * H);
      if (dist > 8) pp.moved = true; // 8px threshold for drag detection
    }
  } else {
    pinchPos[k].t = 0;
  }

  // Track palm velocity for swipe detection
  const palmX = lm[0].x, palmY = lm[0].y;
  const pv = palmVel[k];
  if (pv.t !== 0) {
    const dt = now - pv.t;
    if (dt > 16) {
      pv.x = (palmX - pv.px) / dt * 1000; // velocity in frame-units per second
      pv.y = (palmY - pv.py) / dt * 1000;
      pv.t = now;
      pv.px = palmX;
      pv.py = palmY;
    }
  } else {
    pv.t = now; pv.px = palmX; pv.py = palmY;
  }

  // Index fingertip for air_touch (camera-relative, mapped to screen)
  const indexTip = lm[8];
  const indexTipWorld = wl ? wl[8] : lm[8];

  const [, ix, mi, ri, pk] = ext, curled3 = !mi && !ri && !pk, info = { palm: palm2, palmH: palm2 / H, ext, pinch: pr, touch: pinchNow, level, rel, indexTip, indexTipWorld, pinchPos: { x: pinchX, y: pinchY }, pinchMoved: pinchPos[k].moved, palmVel: { x: pv.x, y: pv.y } };
  let name = 'none';
  if (pr < .4 && curled3 && !ix) name = 'finger_heart';
  else if (pinchNow) name = 'pinch';
  else if (ext.every(Boolean)) name = info.palmH > .38 ? 'high_five' : 'open_palm';
  else if (!ix && !mi && !ri && !pk) name = ext[0] && lm[4].y < lm[0].y - (palm2 * .6) / H ? 'thumbs_up' : 'fist';
  else if (ix && mi && !ri && !pk) name = 'peace';
  else if (ix && curled3) name = 'point';
  return { name, ...info };
}

// ---------- gesture state machine: 280 ms hold to lock, 600 ms cooldown ----------
const HOLD = 280, COOLDOWN = 600;
const G = { cur: 'none', since: 0, fired: false, last: {}, fist: false, lostAt: 0 };

// Drag state: tracks active drag gesture
const dragState = { active: false, hand: -1, startX: 0, startY: 0, lastX: 0, lastY: 0, startTime: 0 };

// Precision mode state: pinch + hold without significant movement
const precisionState = { active: false, hand: -1, startTime: 0, lastEmit: 0 };

function gestureStep(name, now) {
  if (name !== G.cur) { G.cur = name; G.since = now; G.fired = false; }
  Vision.progress = name === 'none' ? 0 : Math.min(1, (now - G.since) / HOLD);
  if (G.fired || name === 'none' || now - G.since < HOLD) return;
  G.fired = true;
  if (now - (G.last[name] || 0) < COOLDOWN) return;
  G.last[name] = now;
  if (name === 'fist') { G.fist = true; emit('fist_start'); return; }
  emit('gesture', { name });
}
function fistRelease(name, now) {
  if (G.fist && name !== 'fist') { if (!G.lostAt) G.lostAt = now; if (now - G.lostAt > 160) { G.fist = false; G.lostAt = 0; emit('fist_end'); } }
  else G.lostAt = 0;
}

// ---------- face expression detectors ----------
const F = { base: null, n: 0, smileSince: 0, yawnSince: 0, droopSince: 0, last: {}, seenAt: 0 };
const cool = (k, ms, now) => (now - (F.last[k] || 0) > ms) && (F.last[k] = now, true);

// ---------- face cues: winks, double blink, brow raise, mouth open, nod, shake ----------
const Q = { bA: .27, bB: .27, state: 'none', since: 0, blinks: [], browBase: null, browSince: 0, mouthSince: 0, hist: [], last: {} };
const cue = (n, now, cd = 900) => { if (now - (Q.last[n] || 0) > cd) { Q.last[n] = now; emit('cue', { name: n }); } };
function revs(a) { let r = 0, pd = 0; for (let i = 1; i < a.length; i++) { const dd = a[i] - a[i - 1]; if (Math.abs(dd) < .012) continue; if (pd && Math.sign(dd) !== Math.sign(pd)) r++; pd = dd; } return r; }
function cueStep(lm, now) {
  const eA = d(lm[33], lm[133]) || 1, eB = d(lm[362], lm[263]) || 1, earA = d(lm[159], lm[145]) / eA, earB = d(lm[386], lm[374]) / eB;
  if (earA > Q.bA * .85) Q.bA += (earA - Q.bA) * .03; if (earB > Q.bB * .85) Q.bB += (earB - Q.bB) * .03;
  const cA = earA < Q.bA * .55, cB = earB < Q.bB * .55, st = cA && cB ? 'both' : cA ? 'A' : cB ? 'B' : 'none';
  if (st !== Q.state) {
    const dur = now - Q.since;
    if (Q.state !== 'none' && dur > 60 && dur < 900) {
      if (Q.state === 'both') { Q.blinks = Q.blinks.filter(t => now - t < 900); Q.blinks.push(now); if (Q.blinks.length >= 2) { Q.blinks = []; cue('double_blink', now, 1200); } }
      else if (dur > 100) cue(Q.state === 'A' ? 'wink_right' : 'wink_left', now, 700);
    }
    Q.state = st; Q.since = now;
  }
  const brow = (d(lm[105], lm[159]) / eA + d(lm[334], lm[386]) / eB) / 2;
  if (Q.browBase === null) Q.browBase = brow; if (brow < Q.browBase * 1.08) Q.browBase += (brow - Q.browBase) * .02;
  if (brow > Q.browBase * 1.2) { Q.browSince = Q.browSince || now; if (now - Q.browSince > 250) cue('brow_raise', now, 1500); } else Q.browSince = 0;
  const mar = d(lm[13], lm[14]) / (d(lm[78], lm[308]) || 1);
  if (mar > .5) { Q.mouthSince = Q.mouthSince || now; if (now - Q.mouthSince > 500) cue('mouth_open', now, 2000); } else Q.mouthSince = 0;
  const ew = Math.abs(lm[263].x - lm[33].x) || .1, yaw = (lm[1].x - (lm[33].x + lm[263].x) / 2) / ew, pit = (lm[1].y - (lm[33].y + lm[263].y) / 2) / ew;
  Q.hist.push({ t: now, yaw, pit }); while (Q.hist.length && now - Q.hist[0].t > 900) Q.hist.shift();
  if (Q.hist.length > 5) {
    const ys = Q.hist.map(h => h.yaw), ps = Q.hist.map(h => h.pit), rg = a => Math.max(...a) - Math.min(...a), ry = rg(ys), rp = rg(ps);
    if (revs(ps) >= 2 && rp > .05 && rp > ry * 1.3) { Q.hist = []; cue('head_nod', now, 1500); } else if (revs(ys) >= 2 && ry > .06 && ry > rp * 1.3) { Q.hist = []; cue('head_shake', now, 1500); }
  }
  Vision.faceFeat = [earA / Q.bA, earB / Q.bB, mar, (d(lm[61], lm[291]) / (d(lm[33], lm[263]) || 1)) / (F.base || 1), d(lm[105], lm[159]) / eA / Q.browBase, d(lm[334], lm[386]) / eB / Q.browBase, yaw, pit];
}
function faceStep(lm, now) {
  cueStep(lm, now);
  const eye = d(lm[33], lm[263]) || 1;
  const smile = d(lm[61], lm[291]) / eye;
  const mar = d(lm[13], lm[14]) / (d(lm[78], lm[308]) || 1);
  const ear = (d(lm[159], lm[145]) + d(lm[386], lm[374])) / (2 * (d(lm[33], lm[133]) || 1));
  if (F.n < 60) { F.base = ((F.base ?? smile) * F.n + smile) / (F.n + 1); F.n++; }
  else if (smile < F.base * 1.05) F.base += (smile - F.base) * 0.01;
  const happy = F.n >= 60 && smile > F.base * 1.18;
  F.smileSince = happy ? F.smileSince || now : 0;
  // user_smile emission REMOVED
  F.yawnSince = mar > 0.62 ? F.yawnSince || now : 0;
  // user_tired emission REMOVED
  F.droopSince = ear < 0.18 ? F.droopSince || now : 0;
  // user_tired emission REMOVED
  Vision.userMood = F.yawnSince || F.droopSince ? 'tired' : happy ? 'happy' : 'calm';
  // eye-contact: normalised nose position, mirrored, smoothed - defer to idle callback
  const nx = faceFilters[0].filter(lm[1].x * 100, now) / 100, ny = faceFilters[1].filter(lm[1].y * 100, now) / 100;
  // Use requestIdleCallback to avoid blocking main thread
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => emit('face_pos', { x: (0.5 - nx) * 2, y: (ny - 0.5) * 2 }));
  } else {
    setTimeout(() => emit('face_pos', { x: (0.5 - nx) * 2, y: (ny - 0.5) * 2 }), 0);
  }
}

// ---------- model loading and main loop ----------
let hand = null, face = null, stream = null, lastTs = 0, frameN = 0, handsSeen = false, fpsCount = 0, fpsT = 0;
let worker = null, busy = false, workerErrors = 0; const votes = [];
const base = 'app://pixie/vendor/';

// Idle callback queue for non-critical work
const idleQueue = [];
let idleScheduled = false;
function scheduleIdle(fn) {
  idleQueue.push(fn);
  if (!idleScheduled) {
    idleScheduled = true;
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(flushIdle);
    } else {
      setTimeout(flushIdle, 0);
    }
  }
}
function flushIdle(deadline) {
  idleScheduled = false;
  const timeRemaining = deadline?.timeRemaining ? deadline.timeRemaining() : 50;
  let start = performance.now();
  while (idleQueue.length && (performance.now() - start) < timeRemaining) {
    const fn = idleQueue.shift();
    try { fn(); } catch (e) { console.warn('idle callback error', e); }
  }
  if (idleQueue.length) scheduleIdle(() => {});
}

async function initMain() {
  if (hand) return;
  const mod = await import(base + 'vision_bundle.mjs');
  const files = await mod.FilesetResolver.forVisionTasks(base + 'wasm');
  const make = async (Klass, file, extra) => {
    for (const delegate of ['GPU', 'CPU']) {
      try { return await Klass.createFromOptions(files, { baseOptions: { modelAssetPath: base + 'models/' + file, delegate }, runningMode: 'VIDEO', ...extra }); }
      catch (e) { if (delegate === 'CPU') throw e; }
    }
  };
  hand = await make(mod.HandLandmarker, 'hand_landmarker.task', { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  face = await make(mod.FaceLandmarker, 'face_landmarker.task', { numFaces: 1 });
}
function initWorker() {
  return new Promise(res => {
    try {
      const w = new Worker(base.replace('vendor/', 'js/') + 'vision.worker.js');
      const to = setTimeout(() => { w.terminate(); res(false); }, 15000);
      w.onmessage = e => {
        if (e.data.type === 'ready') { clearTimeout(to); worker = w; w.onmessage = onWorker; res(true); }
        else if (e.data.type === 'error') { clearTimeout(to); w.terminate(); res(false); }
      };
      w.onerror = () => { clearTimeout(to); res(false); };
      w.postMessage({ type: 'init', base });
    } catch { res(false); }
  });
}
async function dropToMainThread() {
  worker?.terminate(); worker = null; busy = false;
  try { await initMain(); Vision.mode = 'main thread'; } catch (e) { Vision.error = e.message; Vision.running = false; }
}
function onWorker(e) {
  const m = e.data;
  if (m.type === 'result') { busy = false; workerErrors = 0; process(m.hands, m.faceRun, m.face, performance.now() - m.t, m.worlds, m.handed); }
  else if (m.type === 'frameerror') { busy = false; if (++workerErrors > 5) dropToMainThread(); }
}

export async function startVision(video) {
  if (Vision.running) return true;
  try {
    if (!worker && !hand) {
      if (S.worker && await initWorker()) Vision.mode = 'background worker';
      else { await initMain(); Vision.mode = 'main thread'; }
    }
    Vision.ready = true;
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: W }, height: { ideal: H }, frameRate: { ideal: 60 } }, audio: false });
    video.srcObject = stream; await video.play(); Vision.video = video;
    Vision.running = true; Vision.error = null; schedule(video); return true;
  } catch (e) { Vision.error = e.message || String(e); Vision.running = false; return false; }
}
export function stopVision() {
  Vision.running = false; Vision.hands = 0; Vision.face = false;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
}
export async function restartVision() {   // used when the worker option is toggled
  const v = Vision.video; stopVision(); worker?.terminate(); worker = null; hand = face = null; Vision.ready = false; busy = false;
  if (v) await startVision(v);
}

function schedule(v) {
  if (!Vision.running) return;
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => tick(v)); else requestAnimationFrame(() => tick(v));
}

// HUD throttle state
let lastHudEmit = 0;
let lastHandFrameEmit = 0;
let idleFrames = 0;
let faceIdleFrames = 0;
const HUD_THROTTLE_DEFAULT = 33;  // ~30 fps max for HUD updates
const HAND_FRAME_THROTTLE_DEFAULT = 33; // ~30 fps max for hand_frame

function tick(v) {
  if (!Vision.running) return;
  const now = performance.now(), idle = !Vision.hands && !Vision.face;
  
  // Progressive frame skipping when idle
  // Start at 100ms (10fps), increase up to 500ms (2fps) after extended idle
  const baseMinGap = idle ? 100 + Math.min(idleFrames * 20, 400) : (worker ? 16 : 28);
  const minGap = Math.min(baseMinGap, 500);
  
  if (now - lastTs >= minGap && v.readyState >= 2) {
    lastTs = Math.max(now, lastTs + 1); frameN++;
    idleFrames = idle ? idleFrames + 1 : 0;
    
    // Skip face detection entirely after 30 seconds of no face
    const wantFace = (frameN % Vision.faceEvery === 0) && (faceIdleFrames < 900); // 900 frames at 30fps = 30s
    
    if (worker) {
      if (!busy) { busy = true; createImageBitmap(v, { resizeWidth: 480, resizeHeight: 360, resizeQuality: 'low' }).then(bm => worker.postMessage({ type: 'frame', bm, ts: lastTs, face: wantFace, t: now }, [bm])).catch(() => { busy = false; }); }
    } else if (hand) {
      try {
        const t0 = performance.now(), hr = hand.detectForVideo(v, lastTs);
        let fl = null; if (wantFace) { const fr = face.detectForVideo(v, lastTs + 0.5); fl = fr.faceLandmarks?.[0] || null; }
        process(hr.landmarks || [], wantFace, fl, performance.now() - t0, hr.worldLandmarks, (hr.handedness || []).map(h => h[0]?.categoryName));
      } catch (e) { Vision.error = e.message; }
    }
  }
  schedule(v);
}

function process(handsRaw, faceRun, fl, ms, worlds, handed) {
  const now = performance.now();
  // stable identity: left/right label decides which filter bank and pose memory a hand uses (no swapping when hands cross)
  const ids = handsRaw.slice(0, 2).map((_, i) => (handed?.[i] === 'Left' ? 0 : handed?.[i] === 'Right' ? 1 : i)); if (ids.length === 2 && ids[0] === ids[1]) ids[1] = 1 - ids[0];
  const lms = handsRaw.slice(0, 2).map((lm, i) => smoothHand(lm, ids[i], now));
  Vision.hands = lms.length;
  if (lms.length && !handsSeen) { handsSeen = true; emit('hand_enter'); } else if (!lms.length) handsSeen = false;
  let names2 = [];
  if (lms.length) {
    const names = lms.map((l, i) => classify(l, worlds?.[i], ids[i]));
    names2 = names;
    
    // --- New gesture detection ---
    // Check each hand for air_touch, drag, swipe, precision_mode
    names.forEach((n, i) => {
      const handId = ids[i];
      
      // air_touch: index fingertip position mapped to screen coordinates
      // Emitted continuously when index finger is extended (point gesture or open hand)
      if (n.name === 'point' || (n.ext[1] && !n.ext[2] && !n.ext[3] && !n.ext[4])) {
        // Normalize to screen: camera x is flipped (mirror), y is same
        const screenX = (1 - n.indexTip.x) * window.innerWidth;
        const screenY = n.indexTip.y * window.innerHeight;
        emit('air_touch', { hand: handId, x: screenX, y: screenY, rawX: n.indexTip.x, rawY: n.indexTip.y, worldX: n.indexTipWorld.x, worldY: n.indexTipWorld.y, worldZ: n.indexTipWorld.z });
      }
      
      // drag: pinch + hold + move
      if (n.touch) {
        if (!dragState.active && n.pinchMoved) {
          dragState.active = true;
          dragState.hand = handId;
          dragState.startX = n.pinchPos.x;
          dragState.startY = n.pinchPos.y;
          dragState.lastX = n.pinchPos.x;
          dragState.lastY = n.pinchPos.y;
          dragState.startTime = now;
          emit('drag', { hand: handId, phase: 'start', x: n.pinchPos.x, y: n.pinchPos.y, startX: dragState.startX, startY: dragState.startY });
        } else if (dragState.active && dragState.hand === handId) {
          const dx = n.pinchPos.x - dragState.lastX;
          const dy = n.pinchPos.y - dragState.lastY;
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            dragState.lastX = n.pinchPos.x;
            dragState.lastY = n.pinchPos.y;
            emit('drag', { hand: handId, phase: 'move', x: n.pinchPos.x, y: n.pinchPos.y, dx, dy, startX: dragState.startX, startY: dragState.startY });
          }
        }
      } else if (dragState.active && dragState.hand === handId) {
        emit('drag', { hand: handId, phase: 'end', x: dragState.lastX, y: dragState.lastY, startX: dragState.startX, startY: dragState.startY });
        dragState.active = false;
        dragState.hand = -1;
      }

      // precision_mode: pinch + hold (no significant movement) for fine cursor control
      if (n.touch && !n.pinchMoved) {
        if (!precisionState.active) {
          precisionState.active = true;
          precisionState.hand = handId;
          precisionState.startTime = now;
          precisionState.lastEmit = 0;
        } else if (precisionState.hand === handId) {
          // Emit precision position at reduced rate (every ~33ms = 30fps)
          if (now - precisionState.lastEmit > 33) {
            precisionState.lastEmit = now;
            const screenX = (1 - n.pinchPos.x) * window.innerWidth;
            const screenY = n.pinchPos.y * window.innerHeight;
            emit('precision_mode', { hand: handId, x: screenX, y: screenY, rawX: n.pinchPos.x, rawY: n.pinchPos.y, holdTime: now - precisionState.startTime });
          }
        }
      } else if (precisionState.active && precisionState.hand === handId) {
        precisionState.active = false;
        precisionState.hand = -1;
        emit('precision_mode', { hand: handId, phase: 'end', holdTime: now - precisionState.startTime });
      }

      // swipe: open_palm + quick horizontal/vertical movement
      if (n.name === 'open_palm' || n.name === 'high_five') {
        const pv = n.palmVel;
        const speed = Math.hypot(pv.x, pv.y);
        // Threshold: ~2000 frame-units/sec = fast swipe
        if (speed > 2000) {
          const angle = Math.atan2(pv.y, pv.x) * 180 / Math.PI;
          let direction = 'none';
          if (angle > -45 && angle <= 45) direction = 'right';
          else if (angle > 45 && angle <= 135) direction = 'down';
          else if (angle > 135 || angle <= -135) direction = 'left';
          else direction = 'up';
          
          // Debounce: only emit once per swipe gesture
          if (!n._swipeEmitted) {
            n._swipeEmitted = true;
            emit('swipe', { hand: handId, direction, speed, angle, x: n.indexTip.x, y: n.indexTip.y });
          }
        } else {
          n._swipeEmitted = false;
        }
      } else {
        n._swipeEmitted = false;
      }
    });
    
    if (names.length === 2 && names.every(n => n.name === 'open_palm' || n.name === 'high_five')) gestureStep('veto', now);
    else { const best = names.find(n => n.name !== 'none') || names[0]; votes.push(best.name); if (votes.length > 5) votes.shift(); const cnt = {}; votes.forEach(v => cnt[v] = (cnt[v] || 0) + 1); const win = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; gestureStep(win, now); fistRelease(win, now); }
  } else { 
    gestureStep('none', now); 
    fistRelease('none', now);
    // Reset drag/precision on hand lost
    if (dragState.active) {
      emit('drag', { hand: dragState.hand, phase: 'cancel' });
      dragState.active = false;
      dragState.hand = -1;
    }
    if (precisionState.active) {
      emit('precision_mode', { hand: precisionState.hand, phase: 'cancel' });
      precisionState.active = false;
      precisionState.hand = -1;
    }
  }
  
  // Throttled hand_frame emission
  const hudThrottle = S.hudThrottle ?? HUD_THROTTLE_DEFAULT;
  if (now - lastHandFrameEmit >= hudThrottle) {
    lastHandFrameEmit = now;
    emit('hand_frame', { lms, gesture: G.cur, t: now, info: names2, handed: ids });
  }
  
  if (faceRun) {
    if (fl) { faceStep(fl, now); Vision.face = true; F.seenAt = now; faceIdleFrames = 0; emit('face_lm', fl); }
    else { faceIdleFrames++; if (now - F.seenAt > 1500) Vision.face = false; }
  }
  Vision.latency = Math.round(ms);
  if (Vision.previewCanvas && Vision.video) drawPreview(Vision.video, lms, fl);
  fpsCount++; if (now - fpsT > 1000) { Vision.fps = fpsCount; fpsCount = 0; fpsT = now; }
}

function drawPreview(v, hands, fl) {
  const c = Vision.previewCanvas, g = c.getContext('2d'), w = c.width, h = c.height;
  g.save(); g.translate(w, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, w, h); g.restore();
  hands.forEach(lm => drawGlove(g, lm.map(p => [(1 - p.x) * w, p.y * h]), { alpha: .9 }));
}

export const classifyHand = classify;