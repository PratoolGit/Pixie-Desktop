// Pixie's voice: TTS (local, Google Cloud), STT (Groq Whisper), wake-word (Porcupine),
// warm-up, voice selection UI, live captions, and playback queue with ducking.
import { S, routeChain, save } from './store.js';
import { setEmotion, burst, EMOTIONS } from './character.js';

let ctx, gainNode, queue = [], playing = false, warm = false, sttBusy = false;
const duck = () => gainNode?.gain.setValueAtTime(.25, ctx.currentTime);
const unduck = () => gainNode?.gain.setValueAtTime(1, ctx.currentTime);
function init() { if (ctx) return; ctx = new AudioContext(); gainNode = ctx.createGain(); gainNode.connect(ctx.destination); }
function playBuf(buf) { return new Promise(res => { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(gainNode); s.onended = res; s.start(); }); }

export async function speak(text, emotion = 'neutral', o = {}) {
  init(); if (!text?.trim()) return o.onStart?.(), o.onEnd?.(); setEmotion(emotion);
  const t = text.replace(/\s+/g, ' ').trim(); if (!t) return o.onStart?.(), o.onEnd?.(); o.onStart?.();
  const chain = routeChain('tts'); if (!chain.length) { o.onEnd?.(); return sayLocal(t); }
  for (const c of chain) {
    const r = await window.aether.fetch({ url: c.p.base.replace(/\/$/, '') + '/audio/speech', headers: c.p.apiKey ? { Authorization: 'Bearer ' + c.p.apiKey } : {}, timeout: c.p.timeout, json: { model: c.model, input: t, voice: c.p.voice || 'alloy', response_format: 'mp3', speed: c.p.speed || 1 } });
    if (r.ok) { const buf = await ctx.decodeAudioData(r.blob); o.onStart?.(); await playBuf(buf); o.onEnd?.(); return; }
  }
  o.onEnd?.(); return sayLocal(t);
}

async function sayLocal(text) {
  if (!window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.05; u.pitch = 1.05;
  const v = window.speechSynthesis.getVoices().find(v => /female|google|samantha|karen|moira|veena|zira|hazel|susan/i.test(v.name));
  if (v) u.voice = v; u.onstart = () => setEmotion('talking'); u.onend = () => setEmotion('neutral'); window.speechSynthesis.speak(u);
}

const HINDI_TTS_VOICES = {
  'hi-IN-Neural2-A': { name: 'Hindi Neural2 Female', provider: 'google', lang: 'hi-IN', gender: 'FEMALE', type: 'neural2' },
  'hi-IN-Neural2-B': { name: 'Hindi Neural2 Male', provider: 'google', lang: 'hi-IN', gender: 'MALE', type: 'neural2' },
  'hi-IN-Wavenet-A': { name: 'Hindi Wavenet Female', provider: 'google', lang: 'hi-IN', gender: 'FEMALE', type: 'wavenet' },
  'hi-IN-Wavenet-B': { name: 'Hindi Wavenet Male', provider: 'google', lang: 'hi-IN', gender: 'MALE', type: 'wavenet' }
};

const VOICES = [
  { id: 'alloy', name: 'Alloy (OpenAI)', provider: 'openai', lang: 'en-US' },
  { id: 'echo', name: 'Echo (OpenAI)', provider: 'openai', lang: 'en-US' },
  { id: 'fable', name: 'Fable (OpenAI)', provider: 'openai', lang: 'en-US' },
  { id: 'onyx', name: 'Onyx (OpenAI)', provider: 'openai', lang: 'en-US' },
  { id: 'nova', name: 'Nova (OpenAI)', provider: 'openai', lang: 'en-US' },
  { id: 'shimmer', name: 'Shimmer (OpenAI)', provider: 'openai', lang: 'en-US' },
  { id: 'hi-IN-Neural2-A', name: 'Hindi Neural2 Female (Google)', provider: 'google', lang: 'hi-IN', gender: 'FEMALE', type: 'neural2' },
  { id: 'hi-IN-Neural2-B', name: 'Hindi Neural2 Male (Google)', provider: 'google', lang: 'hi-IN', gender: 'MALE', type: 'neural2' },
  { id: 'hi-IN-Wavenet-A', name: 'Hindi Wavenet Female (Google)', provider: 'google', lang: 'hi-IN', gender: 'FEMALE', type: 'wavenet' },
  { id: 'hi-IN-Wavenet-B', name: 'Hindi Wavenet Male (Google)', provider: 'google', lang: 'hi-IN', gender: 'MALE', type: 'wavenet' },
  { id: 'en-US-Neural2-A', name: 'English Neural2 Female (Google)', provider: 'google', lang: 'en-US', gender: 'FEMALE', type: 'neural2' },
  { id: 'en-US-Neural2-C', name: 'English Neural2 Male (Google)', provider: 'google', lang: 'en-US', gender: 'MALE', type: 'neural2' },
  { id: 'en-US-Wavenet-A', name: 'English Wavenet Female (Google)', provider: 'google', lang: 'en-US', gender: 'FEMALE', type: 'wavenet' },
  { id: 'en-US-Wavenet-C', name: 'English Wavenet Male (Google)', provider: 'google', lang: 'en-US', gender: 'MALE', type: 'wavenet' }
];

function voiceForLang(lang) {
  if (lang === 'hi') return VOICES.find(v => v.lang === 'hi-IN' && v.type === 'neural2' && v.gender === 'FEMALE') || VOICES.find(v => v.lang === 'hi-IN');
  if (lang === 'hinglish') return VOICES.find(v => v.lang === 'en-US' && v.provider === 'google' && v.gender === 'FEMALE') || VOICES.find(v => v.lang === 'en-US' && v.provider === 'google');
  return VOICES.find(v => v.id === S.ttsVoice) || VOICES[0];
}

export function getVoices() { return VOICES; }
export function setVoice(id) { S.ttsVoice = id; save(); }

async function warmTTS() {
  if (warm) return; warm = true; init();
  const v = voiceForLang(S.uiLang || 'en');
  const warmupText = (S.uiLang || 'en') === 'hi' ? 'नमस्ते, मैं पिक्सी हूँ।' : (S.uiLang || 'en') === 'hinglish' ? 'Namaste, main Pixie hoon.' : 'Hello, I am Pixie.';
  try { await window.aether.fetch({ url: routeChain('tts')[0]?.p?.base?.replace(/\/$/, '') + '/audio/speech', headers: routeChain('tts')[0]?.p?.apiKey ? { Authorization: 'Bearer ' + routeChain('tts')[0].p.apiKey } : {}, timeout: 5000, json: { model: routeChain('tts')[0].model, input: warmupText, voice: v.id, response_format: 'mp3', speed: 1 } }); } catch {}
}

export async function transcribe(blob, langHint) {
  if (sttBusy) return null; sttBusy = true;
  try {
    const chain = routeChain('stt');
    if (!chain.length) return null;
    const fd = new FormData();
    fd.append('file', blob, 'audio.webm');
    fd.append('model', chain[0].model);
    fd.append('response_format', 'json');
    fd.append('language', langHint || (S.uiLang === 'hi' || S.uiLang === 'hinglish' ? 'hi' : 'en'));
    const r = await window.aether.fetch({ url: chain[0].p.base.replace(/\/$/, '') + '/audio/transcriptions', headers: chain[0].p.apiKey ? { Authorization: 'Bearer ' + chain[0].p.apiKey } : {}, timeout: chain[0].p.timeout, body: fd });
    if (r.ok) return JSON.parse(r.text).text;
  } finally { sttBusy = false; }
  return null;
}

export function stopSpeaking() { if (ctx) { queue = []; playing = false; const s = ctx.createBufferSource(); s.connect(gainNode); s.start(); s.stop(); } window.speechSynthesis?.cancel(); setEmotion('neutral'); }

export async function playTone(freq = 880, dur = .12, vol = .2) { init(); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; o.type = 'sine'; g.gain.value = vol; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur); await new Promise(r => setTimeout(r, dur * 1000)); }

const Sound = {
  wake: () => playTone(660, .08).then(() => playTone(880, .08)).then(() => playTone(1100, .1)),
  chime: () => playTone(1320, .07).then(() => playTone(1760, .07)).then(() => playTone(2200, .1)),
  whoosh: () => { init(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(440, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + .3); g.gain.setValueAtTime(.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .3); },
  celebrate: () => { for (const f of [880, 1100, 1320, 1760, 2200]) { await playTone(f, .06, .15); await new Promise(r => setTimeout(r, 40)); } },
  error: () => playTone(220, .2, .2),
  click: () => playTone(1200, .03, .08)
};
export { Sound };