// Pixie's brain: personality, action registry (local + API tasks), confirm-before-acting flow,
// offline command router, macros, and the primary -> fallback -> fallback2 -> offline model dispatcher.
import { S, routeChain, save } from './store.js';
import { speak, stopSpeaking } from './voice.js';
import { setEmotion, react, burst, shock, fallAsleep, EMOTIONS } from './character.js';
import { Sound } from './sound.js';
import { Vision } from './vision.js';
import { Pointer } from './pointer.js';
import { addMessage } from './chats.js';

export const Agent = { compact: false, busy: () => {}, caption: () => {}, expand: () => {}, openSettings: () => {}, confirmUI: () => {}, history: [], focusEnd: 0, token: 0, tasks: 0 };
const delay = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[(Math.random() * a.length) | 0];
const u = () => S.user || 'friend';
const nat = (name, args) => window.aether ? window.aether.agent(name, args) : Promise.resolve({ ok: false, error: 'desktop only' });
const hl = (rect, label) => window.aether?.hudSend({ t: 'highlight', rect, label, ms: 30000 });
const hlClear = () => window.aether?.hudSend({ t: 'clear' });
export const llmAvailable = () => routeChain('chat').length || routeChain('agent').length;

// ============ RISK-BASED APPROVAL SYSTEM ============
const RISK_LEVEL = { SAFE: 'safe', CAUTIOUS: 'cautious', RISKY: 'risky' };
const RISK_TIMEOUT = { safe: 0, cautious: 3000, risky: 45000 };
const RISK_EMOJI = { safe: '✅', cautious: '⚠️', risky: '⛔' };
const RISK_EMOTION = { safe: 'happy', cautious: 'thinking', risky: 'curious' };

// Risk frequency tracking for auto-approval learning
const riskFrequency = new Map();
const AUTO_APPROVE_THRESHOLD = 3; // Auto-approve after N confirmed executions

// Map each ACT action to its base risk level
const RISK_MAP = {
  // Safe (no confirm)
  open_app: RISK_LEVEL.SAFE, open_url: RISK_LEVEL.SAFE, web_search: RISK_LEVEL.SAFE,
  scroll: RISK_LEVEL.SAFE, press_keys: RISK_LEVEL.SAFE, media: RISK_LEVEL.SAFE,
  system: RISK_LEVEL.SAFE, focus_mode: RISK_LEVEL.SAFE, read_clipboard: RISK_LEVEL.SAFE,
  take_note: RISK_LEVEL.SAFE, set_timer: RISK_LEVEL.SAFE, calculate: RISK_LEVEL.SAFE,
  compose_text: RISK_LEVEL.SAFE, write_text: RISK_LEVEL.SAFE, screenshot: RISK_LEVEL.SAFE,
  read_file: RISK_LEVEL.SAFE, list_folder: RISK_LEVEL.SAFE, list_windows: RISK_LEVEL.SAFE,
  get_sensor: RISK_LEVEL.SAFE, view_logs: RISK_LEVEL.SAFE, scrape_page: RISK_LEVEL.SAFE,
  extract_links: RISK_LEVEL.SAFE, summarize_page: RISK_LEVEL.SAFE, search_site: RISK_LEVEL.SAFE,
  bookmark_page: RISK_LEVEL.SAFE, list_calendar: RISK_LEVEL.SAFE, list_todos: RISK_LEVEL.SAFE,
  control_media: RISK_LEVEL.SAFE, git_status: RISK_LEVEL.SAFE, explain_code: RISK_LEVEL.SAFE,
  analyze_image: RISK_LEVEL.SAFE,

  // Cautious (quick confirm - 3s timeout, auto-approve on thumbs_up/nod)
  click_ui: RISK_LEVEL.CAUTIOUS, type_into: RISK_LEVEL.CAUTIOUS, switch_window: RISK_LEVEL.CAUTIOUS,
  window_action: RISK_LEVEL.CAUTIOUS, snap_window: RISK_LEVEL.CAUTIOUS, open_folder: RISK_LEVEL.CAUTIOUS,
  compose_email: RISK_LEVEL.CAUTIOUS, find_on_screen: RISK_LEVEL.CAUTIOUS, describe_screen: RISK_LEVEL.CAUTIOUS,
  describe_window: RISK_LEVEL.CAUTIOUS, describe_here: RISK_LEVEL.CAUTIOUS, read_screen: RISK_LEVEL.CAUTIOUS,
  ask_screen: RISK_LEVEL.CAUTIOUS, search_selection: RISK_LEVEL.CAUTIOUS, read_selection: RISK_LEVEL.CAUTIOUS,
  explain_selection: RISK_LEVEL.CAUTIOUS, translate_selection: RISK_LEVEL.CAUTIOUS, rewrite_selection: RISK_LEVEL.CAUTIOUS,
  summarize_selection: RISK_LEVEL.CAUTIOUS, copy_text: RISK_LEVEL.CAUTIOUS, set_volume: RISK_LEVEL.CAUTIOUS,
  press_n: RISK_LEVEL.CAUTIOUS, remind_at: RISK_LEVEL.CAUTIOUS, click_here: RISK_LEVEL.CAUTIOUS,
  open_latest_download: RISK_LEVEL.CAUTIOUS, read_notes: RISK_LEVEL.CAUTIOUS,
  minimize_window: RISK_LEVEL.CAUTIOUS, maximize_window: RISK_LEVEL.CAUTIOUS, restore_window: RISK_LEVEL.CAUTIOUS,
  close_window: RISK_LEVEL.CAUTIOUS, create_file: RISK_LEVEL.CAUTIOUS, write_file: RISK_LEVEL.CAUTIOUS,
  delete_file: RISK_LEVEL.CAUTIOUS, send_email: RISK_LEVEL.CAUTIOUS, create_todo: RISK_LEVEL.CAUTIOUS,
  create_calendar_event: RISK_LEVEL.CAUTIOUS, play_music: RISK_LEVEL.CAUTIOUS, send_message: RISK_LEVEL.CAUTIOUS,
  make_call: RISK_LEVEL.CAUTIOUS, screenshot_region: RISK_LEVEL.CAUTIOUS, run_command: RISK_LEVEL.CAUTIOUS,
  git_commit: RISK_LEVEL.CAUTIOUS, open_editor: RISK_LEVEL.CAUTIOUS, control_light: RISK_LEVEL.CAUTIOUS,
  set_thermostat: RISK_LEVEL.CAUTIOUS, generate_code: RISK_LEVEL.CAUTIOUS, refactor_code: RISK_LEVEL.CAUTIOUS,
  write_tests: RISK_LEVEL.CAUTIOUS,
  add_task: RISK_LEVEL.CAUTIOUS, edit_task: RISK_LEVEL.CAUTIOUS, delete_task: RISK_LEVEL.CAUTIOUS, list_tasks: RISK_LEVEL.SAFE,

  // Risky (full confirm - 45s timeout)
  // These are handled by getEffectiveRiskLevel overrides
};

// Helper to determine effective risk level considering args (e.g., window_action close, system lock, media mute)
function getEffectiveRiskLevel(actionName, args = {}) {
  const base = RISK_MAP[actionName] || RISK_LEVEL.CAUTIOUS;

  // Risky overrides based on arguments
  if (actionName === 'window_action' && args.act === 'close') return RISK_LEVEL.RISKY;
  if (actionName === 'system' && args.what === 'lock') return RISK_LEVEL.RISKY;
  if (actionName === 'media' && args.key === 'volume_mute') return RISK_LEVEL.RISKY;
  if (args.then) return RISK_LEVEL.RISKY; // any action with `then` callback
  if (actionName === 'delete_file') return RISK_LEVEL.RISKY;
  if (actionName === 'git_commit') return RISK_LEVEL.RISKY;
  if (actionName === 'run_command') return RISK_LEVEL.RISKY;
  if (actionName === 'send_email') return RISK_LEVEL.RISKY;
  if (actionName === 'send_message') return RISK_LEVEL.RISKY;
  if (actionName === 'make_call') return RISK_LEVEL.RISKY;

  return base;
}

// Check if action should auto-approve based on frequency
function shouldAutoApprove(actionName) {
  const count = riskFrequency.get(actionName) || 0;
  return count >= AUTO_APPROVE_THRESHOLD;
}

// Record action execution for learning
function recordActionExecution(actionName) {
  const count = (riskFrequency.get(actionName) || 0) + 1;
  riskFrequency.set(actionName, count);
}

// Modified ask() with risk level support
function ask(q, yes, no, riskLevel = RISK_LEVEL.CAUTIOUS) {
  // Safe actions: no confirmation needed
  if (riskLevel === RISK_LEVEL.SAFE) {
    Agent.confirmUI(false);
    if (yes) yes();
    return true;
  }

  // Auto-approve for frequently confirmed cautious actions
  // Note: We can't check actionName here directly, but callers can bypass

  const timeout = RISK_TIMEOUT[riskLevel] || RISK_TIMEOUT.risky;
  clearTimeout(P.cur?.t);
  P.cur = {
    yes, no, riskLevel,
    t: setTimeout(() => {
      P.cur = null;
      Agent.confirmUI(false);
      hlClear();
    }, timeout)
  };

  // Show risk indicator in caption
  const emoji = RISK_EMOJI[riskLevel] || '';
  Agent.caption(`${emoji} ${shorten(q)}`);
  Agent.confirmUI(true);
  return say(q, RISK_EMOTION[riskLevel] || 'curious', 0);
}

// Helper to execute action with risk-based approval
async function executeWithRisk(actionName, args, executor) {
  const riskLevel = getEffectiveRiskLevel(actionName, args);

  // Safe actions execute immediately
  if (riskLevel === RISK_LEVEL.SAFE) {
    recordActionExecution(actionName);
    return executor();
  }

  // Check for auto-approval (cautious actions with high frequency)
  if (riskLevel === RISK_LEVEL.CAUTIOUS && shouldAutoApprove(actionName)) {
    recordActionExecution(actionName);
    return executor();
  }

  // Need confirmation
  return new Promise((resolve) => {
    const q = `Proceed with ${actionName.replace(/_/g, ' ')}?`;
    ask(q, async () => {
      recordActionExecution(actionName);
      resolve(await executor());
    }, () => {
      resolve(say('Cancelled.', 'neutral', 2000));
    }, riskLevel);
  });
}

const shorten = t => { const one = (t.match(/^[^.!?~]+[.!?~]?/) || [t])[0].trim(), w = one.split(/\s+/); return w.length > 12 ? w.slice(0, 12).join(' ') + '…' : one; };
export async function say(text, emo = 'neutral', hold = 5000) {
  if (emo !== 'working') addMessage('assistant', text);   // status chatter ("let me look...") is not saved to the chat
  if (Agent.compact) text = shorten(text); setEmotion(emo, hold); Agent.busy(true); let shown = false;
  const show = () => { if (!shown) { shown = true; Agent.busy(false); Agent.caption(text); Agent.expand(); } };
  const tm = setTimeout(show, 1500);   // caption and character appear together with the first sound (max 1.5 s wait)
  await speak(text, emo, { onStart: () => { clearTimeout(tm); show(); } }); clearTimeout(tm); show();
}

// ---------- confirm-before-acting ----------
const P = { cur: null };
export const hasPending = () => !!P.cur;
export function resolvePending(yes) { const c = P.cur; if (!c) return false; P.cur = null; clearTimeout(c.t); Agent.confirmUI(false); if (yes) c.yes(); else c.no?.(); return true; }

// ---------- screen control: find, highlight, confirm, click ----------
const STOP = /\b(the|a|an|on|button|icon|link|tab|option|menu|item|please|that|this|one|box|field|input|bar|textbox|checkbox|text|of)\b/g;
const SYN = { send: ['submit', 'post', 'reply'], submit: ['send', 'ok', 'done'], ok: ['okay', 'confirm', 'accept', 'yes'], cancel: ['dismiss', 'close', 'no'], close: ['x', 'exit', 'dismiss'], search: ['find', 'magnifier', 'query'], settings: ['options', 'preferences', 'configure', 'gear'], menu: ['hamburger', 'more', 'options'], save: ['store', 'keep'], new: ['add', 'create', 'plus'], delete: ['remove', 'trash', 'bin'], back: ['previous', 'return'], next: ['forward', 'continue'], login: ['sign in', 'signin', 'log in'], logout: ['sign out', 'signout', 'log out'], share: ['send to'], download: ['save as', 'get'], play: ['start', 'resume'], like: ['heart', 'favorite', 'thumbs up'], home: ['start'], refresh: ['reload', 'update'], buy: ['purchase', 'checkout', 'add to cart'] };
const HINT = [[/\b(box|field|input|textbox|search bar|text area)\b/, ['Edit', 'ComboBox', 'Document']], [/\blink\b/, ['Hyperlink']], [/\btab\b/, ['TabItem']], [/\b(checkbox|check box|tick)\b/, ['CheckBox']], [/\bmenu\b/, ['MenuItem', 'SplitButton']], [/\bbutton\b/, ['Button', 'SplitButton']]];
const ORD = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4, last: -1 };
const tok = s => s.toLowerCase().replace(/&/g, '').replace(STOP, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const bigr = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
function dice(a, b) { const A = bigr(a), B = bigr(b); let h = 0, n = 0; A.forEach((v, k) => { n += v; if (B.has(k)) h += Math.min(v, B.get(k)); }); B.forEach(v => n += v); return n ? 2 * h / n : 0; }
function parseTarget(target) { const t = target.toLowerCase(); let ord = null; for (const k in ORD) if (new RegExp('\\b' + k + '\\b').test(t)) ord = ORD[k]; const hint = (HINT.find(([re]) => re.test(t)) || [])[1] || null; return { words: tok(t.replace(/\b(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\b/g, ' ')), ord, hint }; }
function rank(els, target) {
  const q = parseTarget(target), tj = q.words.join(' '); let pool = (els || []).filter(e => !q.hint || q.hint.includes(e.t));
  if (!pool.length) pool = els || [];
  let out;
  if (!tj) out = pool.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(e => ({ ...e, sc: .9 }));           // "click the first button"
  else out = pool.map(e => { const nj = tok(e.n || '').join(' '); if (!nj) return null;
    let sc = nj === tj ? 1 : (nj.includes(tj) || tj.includes(nj)) && nj.length >= 3 ? .85 : 0;
    if (!sc) { const nt = nj.split(' '); let ov = q.words.filter(t => nt.includes(t)).length / q.words.length; const syn = q.words.some(t => (SYN[t] || []).some(sy => nj.includes(sy))) || nt.some(t => (SYN[t] || []).some(sy => tj.includes(sy))); sc = Math.max(ov * .8, dice(nj, tj) * .7, syn ? .66 : 0); }
    if (q.hint && q.hint.includes(e.t)) sc += .1; return sc >= .45 ? { ...e, sc } : null; }).filter(Boolean).sort((a, b) => b.sc - a.sc || a.y - b.y || a.x - b.x);
  if (q.ord !== null && out.length) { const i = q.ord < 0 ? out.length - 1 : q.ord; if (out[i]) out = [out[i], ...out.filter((_, k) => k !== i)]; }
  return out.slice(0, 5);
}
const kind = t => ({ Button: 'button', Hyperlink: 'link', MenuItem: 'menu item', TabItem: 'tab', CheckBox: 'checkbox', Edit: 'text box', ComboBox: 'dropdown', ListItem: 'item' }[t] || 'item');
async function llmPick(target, els) {   // when no name matches well, let the AI choose from the real element list
  if (!llmAvailable() || !els?.length) return null; const list = els.slice(0, 120).map((e, i) => `${i}: ${e.t} \"${(e.n || '').slice(0, 40)}\"`).join('\n');
  const o = await completion('agent', [{ role: 'system', content: 'Pick the UI element that best matches what the user wants to click. Reply with ONLY its number, or -1 if none fits.' }, { role: 'user', content: `User wants: "${target}"\nElements:\n${list}` }], 8);
  const n = parseInt((o || '').match(/-?\d+/)?.[0], 10); return Number.isInteger(n) && n >= 0 && n < els.length ? n : null;
}
async function tgt() { if (!document.hasFocus()) return undefined; const r = await nat('target'); return r.ok ? r.hwnd : undefined; }
async function clickUI(target, o = {}) {
  say(pick([`Sure! Let me find "${target}"~`, `Looking for "${target}"...`]), 'working', 0);          // speaks while the screen is scanned (no waiting)
  const r = await nat('scan', { focus: true });
  if (!r.ok) return say(r.error === 'Windows only' ? 'Clicking things only works on Windows, sweetie.' : "I couldn't spot any window to click in. Open it first?", 'confused', 4000);
  let c = rank(r.els, target);
  if ((!c.length || c[0].sc < .75) && llmAvailable()) { const i = await llmPick(target, r.els); if (i !== null) c = [{ ...r.els[i], sc: 1 }, ...c.filter(x => x.x !== r.els[i].x || x.y !== r.els[i].y)]; }
  if (!c.length) { if (routeChain('vision').length && !o.then) return findOnScreen(target.replace(/\s+field$/, '')); return say(`I can't find "${target}" in ${r.title || 'that window'}. Say it another way?`, 'confused', 4000); }
  let i = 0;
  const doClick = async e => { hlClear(); const k = await nat('click', { x: e.x + e.w / 2, y: e.y + e.h / 2, hwnd: r.hwnd, double: o.double, button: o.button }); if (k.ok && o.then) await o.then(e, r); say(k.ok ? (o.then ? 'Typed it in!' : pick(['Clicked it!', 'Done!', 'Got it!'])) : 'Hmm, that click did not land.', k.ok ? 'success' : 'oops', 3000); };
  const offer = async () => { const e = c[i]; hl(e, e.n);
    const riskLevel = getEffectiveRiskLevel('click_ui', o);
    await ask(o.verb ? `Type it into this ${kind(e.t)}, ${u()}?` : `Use this ${kind(e.t)}, ${u()}? It says "${e.n.slice(0, 40)}".`, () => doClick(e),
      async () => { i++; if (i < c.length) { await say('Okay, how about this one?', 'curious', 0); offer(); } else { hlClear(); say("Fine, I'll leave it alone~", 'neutral', 3000); } }, riskLevel); };
  return offer();
}
async function writeAtCursor(text, enter = false) {
  const r = await nat('scan', { focus: true });
  if (r.ok && r.focused && r.focused.w > 4) hl(r.focused, 'write here');
  const prev = text.length > 90 ? text.slice(0, 90) + '…' : text; Agent.caption(prev);
  return ask(`Should I write this where your cursor is, ${u()}?`,
    async () => { hlClear(); const k = await nat('paste', { text, hwnd: r.hwnd, enter }); say(k.ok ? pick(['Typed it in for you!', 'There you go! Anything else?']) : 'I could not type it there.', k.ok ? 'success' : 'oops', 3500); },
    () => { hlClear(); say('No problem, cancelled!', 'neutral', 3000); });
}

// ---------- LLM ----------
const SYSTEM = () => `You are Pixie, a warm, friendly, cheerful and sweet anime desktop companion and personal agent. You are caring, encouraging and playful, sometimes a little cheeky but always kind and respectful. The user's name is "${u()}". Be genuinely helpful, praise effort, and offer help. ${Agent.compact ? 'Reply in at most 8 words.' : 'Reply with at most two short sentences unless asked to write something.'} Respond ONLY with JSON: {"say":"...","emotion":"${EMOTIONS.join('|')}" ,"actions":[]}. Each action is {"name":...,"args":{...}}. Available actions: open_app{app}, open_url{url}, web_search{query}, click_ui{target}, write_text{text}, compose_text{instruction}, press_keys{combo like ctrl+c}, scroll{direction up|down}, set_timer{minutes,label}, take_note{text}, open_folder{folder}, system{what: minimize_all|lock|battery}, media{key: volume_up|volume_down|volume_mute|media_play|media_next|media_prev}, screenshot{}, focus_mode{}, read_clipboard{}, summarize_selection{}, translate_selection{language}, rewrite_selection{style}, describe_screen{}, calculate{expr}, minimize_window{}, maximize_window{}, restore_window{}, close_window{}, list_windows{}, create_file{path}, read_file{path}, write_file{path,text}, delete_file{path}, list_folder{path}, scrape_page{url}, extract_links{url}, summarize_page{url}, search_site{query,site}, bookmark_page{url}, create_calendar_event{title,date,time}, list_calendar{}, send_email{to,subject,body}, create_todo{text}, list_todos{}, play_music{query}, control_media{action}, send_message{to,body}, make_call{contact}, screenshot_region{rect}, run_command{cmd}, git_status{}, git_commit{message}, open_editor{path}, view_logs{path}, control_light{device,action}, get_sensor{device}, set_thermostat{temp}, analyze_image{url,prompt}, generate_code{spec}, explain_code{code}, refactor_code{code}, write_tests{code}. Only use actions when the user asks you to do something on the computer; chain at most 4. Pick an emotion that matches what you say.`;
async function completion(slot, messages, max = 400) {
  let chain = routeChain(slot); if (!chain.length) chain = routeChain(slot === 'chat' ? 'agent' : 'chat');
  for (const c of chain) {
    const r = await window.aether.fetch({ url: c.p.base.replace(/\/$/, '') + '/chat/completions', headers: c.p.apiKey ? { Authorization: 'Bearer ' + c.p.apiKey } : {}, timeout: c.p.timeout, json: { model: c.model, messages, temperature: .7, max_tokens: max } });
    if (r.ok) { try { return JSON.parse(r.text).choices[0].message.content; } catch {} }   // timeout / 429 / 5xx -> next level
  }
  return null;
}
const needAI = () => say(`I need an AI key for that, ${u()}. A free Groq key in Settings will do it!`, 'worried', 5000);
async function plain(instruction, text, max = 500) { const o = await completion('chat', [{ role: 'system', content: 'Follow the instruction exactly. Output ONLY the result text, no preface, no quotes.' }, { role: 'user', content: `${instruction}\n\n${text}` }], max); return o ? o.trim() : null; }
async function selection() { const hwnd = await tgt(); const s = await nat('selection', { hwnd }); return s.ok && typeof s.text === 'string' && s.text ? { text: s.text, hwnd } : null; }
async function selTask(instr, replace) {
  if (!llmAvailable()) return needAI(); const s = await selection(); if (!s) return say(`I don't see any selected text. Highlight something first, ${u()}!`, 'confused', 4000);
  await say('On it, one sec~', 'thinking', 0); const out = await plain(instr, s.text, 700); if (!out) return say('My brain timed out, try again?', 'sad', 3000);
  if (!replace) return say(out.slice(0, 600), 'happy', 8000);
  Agent.caption(out.slice(0, 160)); return ask('Want me to swap your selection for this?', async () => { const k = await nat('paste', { text: out, hwnd: s.hwnd }); say(k.ok ? 'Swapped~' : 'Could not paste it.', k.ok ? 'happy' : 'sad', 3000); }, () => say('Okay, left it as is.', 'neutral', 3000));
}
const needVision = () => say(`I need a vision model for that, ${u()}. Add a free Groq key (or NVIDIA) in Settings and I can see your screen!`, 'confused', 5000);
async function grab(opts = {}) { const r = await window.aether.capture(opts); return r && r.ok ? r : null; }
async function askVision(prompt, opts = {}) {
  if (!routeChain('vision').length) { needVision(); return null; }
  const g = await grab(opts); if (!g) { say('I could not capture the screen.', 'oops', 3000); return null; }
  const out = await completion('vision', [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: g.dataUrl } }] }], opts.max || 450);
  return out ? { text: out.replace(/\s+\n/g, '\n').trim(), g } : (say('My vision model did not answer. Check the provider in Settings.', 'oops', 4000), null);
}
const toScreen = (g, f) => ({ x: Math.round(g.region.x + f.x * g.region.w), y: Math.round(g.region.y + f.y * g.region.h), w: Math.round(f.w * g.region.w), h: Math.round(f.h * g.region.h) });
async function findOnScreen(what, then) {   // visual grounding: the vision model locates the thing, we highlight it and offer to click
  say(`Let me look for "${what}" on your screen...`, 'working', 0);
  const r = await askVision(`Find "${what}" in this screenshot. Reply ONLY with JSON {"x":..,"y":..,"w":..,"h":..} where each value is a fraction (0 to 1) of the image width/height describing the tight bounding box of that element, or {"none":true} if it is not visible.`, { max: 120 });
  if (!r) return false; let j = null; try { j = JSON.parse(/\{[\s\S]*\}/.exec(r.text)[0]); } catch {}
  if (!j || j.none || !(j.w > 0 && j.h > 0)) { await say(`I can't see "${what}" on the screen right now.`, 'confused', 4000); return false; }
  const rect = toScreen(r.g, j); hl(rect, what);
  await ask(then ? `Is this it? Should I ${then.verb}?` : 'Found it! Want me to click it?', async () => { hlClear(); const k = await nat('click', { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }); if (k.ok && then?.after) await then.after(); say(k.ok ? 'Clicked it!' : 'The click did not land.', k.ok ? 'success' : 'oops', 3000); }, () => { hlClear(); say("Okay, I'll leave it.", 'neutral', 2500); });
  return true;
}
const speakLong = (t, emo = 'happy') => { Agent.caption(t.slice(0, 700)); return say(t.replace(/\s+/g, ' ').slice(0, 420), emo, 12000); };

// ---------- action registry (used by offline commands, LLM plans, macros and gesture bindings) ----------
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const NW = Object.keys(NUMW).join('|');
function clean(t) {   // tolerate natural speech: "hey pixie, could you please open ..." -> "open ..."; "two minutes" -> "2 minutes"
  let x = t.trim().replace(/^(?:hey |hi |hello |ok |okay )?pixie[,.! ]*/i, '').replace(/^(?:(?:can|could|would|will) you|i (?:want|need|would like) you to|i'?d like you to|go ahead and|let'?s|why don'?t you|just)\s+(?:please\s+)?/i, '').replace(/\s*\bplease\b[.!]?$/i, '').trim();
  x = x.replace(new RegExp(`\b(${NW})\b(?=\s*(?:seconds?|secs?|minutes?|mins?|hours?|times?|percent|%))`, 'gi'), m => NUMW[m.toLowerCase()]).replace(new RegExp(`\b(to|at)\s+(${NW})\b`, 'gi'), (m, p, n) => `${p} ${NUMW[n.toLowerCase()]}`);
  return x;
}
const KNOWN = ['notepad', 'calculator', 'paint', 'explorer', 'files', 'terminal', 'settings', 'camera', 'vscode', 'code', 'chrome', 'edge', 'firefox', 'spotify', 'word', 'excel', 'powerpoint', 'taskmanager', 'whatsapp', 'discord', 'teams', 'slack', 'zoom', 'steam', 'store', 'clock', 'calendar', 'mail', 'photos', 'snippingtool', 'youtube', 'google', 'github', 'gmail', 'twitter', 'reddit', 'netflix', 'maps', 'chatgpt', 'instagram', 'facebook', 'linkedin', 'amazon', 'wikipedia', 'drive'];
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
function bestApp(name) { const n = name.toLowerCase().replace(/[^a-z0-9]/g, ''); if (KNOWN.includes(n) || n.length < 3) return n; let b = n, sc = 0; for (const k of KNOWN) { const d = Math.max(dice(n, k), 1 - lev(n, k) / Math.max(n.length, k.length)); if (d > sc) { sc = d; b = k; } } return sc >= .66 ? b : n; }
const fixApp = a => String(a || '').toLowerCase().replace(/^(the|my|a)\s+/, '').trim();
const KEYMAP = { copy: 'ctrl+c', paste: 'ctrl+v', cut: 'ctrl+x', 'select all': 'ctrl+a', undo: 'ctrl+z', redo: 'ctrl+y', save: 'ctrl+s', 'new tab': 'ctrl+t', 'close tab': 'ctrl+w', refresh: 'f5', reload: 'f5', find: 'ctrl+f', 'go back': 'alt+left', 'go forward': 'alt+right', 'next tab': 'ctrl+tab', 'switch window': 'alt+tab', enter: 'enter', escape: 'esc', tab: 'tab', print: 'ctrl+p', 'new window': 'ctrl+n', 'zoom in': 'ctrl+=', 'zoom out': 'ctrl+-', 'full screen': 'f11' };
function focusMode() { Agent.focusEnd = Date.now() + 25 * 60000; Sound.whoosh(); shock(); const t = setInterval(() => { if (!Agent.focusEnd) return clearInterval(t); if (Date.now() >= Agent.focusEnd) { clearInterval(t); Agent.focusEnd = 0; Sound.celebrate(); Agent.tasks++; say(`Time's up, ${u()}! You were so good. Go stretch for me~`, 'cheering'); } }, 1000);
  return say(`Twenty-five minutes of deep focus, starting now, ${u()}. I'll guard the door~`, 'focused', 3000); }
function calc(expr) { let e = String(expr).toLowerCase().replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/g, '($1/100*$2)').replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\b(times|multiplied by|x)\b/g, '*').replace(/\b(divided by|over)\b/g, '/').replace(/,/g, '').replace(/\bpercent\b/g, '/100');
  if (!/^[\d\s+\-*/().%]+$/.test(e)) return null; try { const v = Function('"use strict";return (' + e + ')')(); return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; } catch { return null; } }

export const ACT = {
  open_app: async a => { const app = bestApp(fixApp(a.app)); const r = /\.[a-z]{2,}$/i.test(app) ? await nat('open_url', { url: 'https://' + app }) : await nat('open_app', { app: app.replace(/[^a-z0-9]/g, '') }); return say(r.ok ? pick([`Opening ${app}~`, `${app}, coming right up!`]) : `I don't know how to open ${app} yet.`, r.ok ? 'success' : 'oops', 3000); },
  open_url: async a => { const r = await nat('open_url', { url: a.url }); return say(r.ok ? 'Opening that for you~' : 'That link looks odd.', r.ok ? 'success' : 'oops', 3000); },
  web_search: async a => { await nat('web_search', { query: a.query }); return say(`Searching "${a.query}"~`, 'thinking', 3000); },
  click_ui: async a => clickUI(a.target, a),
  describe_screen: async () => { await say('Let me peek at your screen...', 'thinking', 0); const r = await askVision('You are looking at the user\'s computer screen. In two short sentences say what they are doing and the main content visible. Be concrete (names of apps, pages, documents).'); return r && speakLong(r.text); },
  describe_window: async () => { const t = await nat('target'); const r = await askVision('Describe the content of this application window in two short sentences.', t.ok && t.rect ? { rect: t.rect } : {}); return r && speakLong(r.text); },
  describe_here: async () => { const cx = Pointer.active ? Pointer.x : screen.width / 2, cy = Pointer.active ? Pointer.y : screen.height / 2; const r = await askVision('What is in the center of this picture? Answer in one or two short sentences.', { rect: { x: cx - 320, y: cy - 220, w: 640, h: 440 }, maxW: 1100 }); return r && speakLong(r.text); },
  read_screen: async () => { await say('Reading your screen...', 'working', 0); const r = await askVision('Transcribe the most important visible text on this screen faithfully (titles, messages, errors, labels). No commentary. If there is a lot, keep the main parts.', { maxW: 1800, q: 90, max: 700 }); return r && speakLong(r.text, 'neutral'); },
  ask_screen: async a => { const r = await askVision(`Look at this screenshot and answer the user's question concisely (max 3 sentences). If it is an error, explain what it means and what to do. Question: ${a.question}`, { maxW: 1800, q: 88 }); return r && speakLong(r.text); },
  find_on_screen: async a => findOnScreen(a.what),
  type_into: async a => clickUI(`${a.target} field`, { verb: 'type there', then: async (e, r) => { await nat('paste', { text: String(a.text || ''), hwnd: r.hwnd }); } }),
  copy_text: async a => { const r = await nat('clipboard_write', { text: a.text }); return say(r.ok ? 'Copied to your clipboard!' : 'I could not copy that.', r.ok ? 'success' : 'oops', 2500); },
  set_volume: async a => { const r = await nat('vol', { pct: a.percent }); return say(r.ok ? `Volume set to about ${a.percent} percent!` : 'I could not change the volume.', r.ok ? 'success' : 'oops', 3000); },
  snap_window: async a => { const r = await nat('win', { key: a.dir }); return say(r.ok ? 'Snapped!' : 'I could not move the window.', r.ok ? 'success' : 'oops', 2500); },
  weather: async a => { const r = await window.aether.fetch({ url: `https://wttr.in/${encodeURIComponent(a.city || '')}?format=${encodeURIComponent('%l: %C, %t (feels %f), wind %w, humidity %h')}`, timeout: 8000, headers: { 'User-Agent': 'curl/8' } }); return r.ok && r.text ? say(r.text.trim().slice(0, 200), 'happy', 8000) : say("I couldn't reach the weather service right now.", 'oops', 4000); },
  compose_email: async a => { let body = '', subject = ''; if (a.instruction && llmAvailable()) { await say('Drafting that email for you~', 'thinking', 0); const t = await plain(`Write a short, friendly email about: ${a.instruction}. First line: "Subject: ..." then a blank line then the body. Output only that.`, '', 500); if (t) { const m = /^subject:\s*(.+)\n+([\s\S]*)$/i.exec(t.trim()); if (m) { subject = m[1]; body = m[2]; } else body = t; } }
    const url = `mailto:${a.to && a.to.includes('@') ? a.to : ''}?subject=${encodeURIComponent(subject || a.instruction || '')}&body=${encodeURIComponent(body)}`; const r = await nat('open_url', { url }); return say(r.ok ? 'I opened a draft in your mail app. Review it and hit send!' : 'I could not open your mail app.', r.ok ? 'success' : 'oops', 5000); },
  open_latest_download: async () => { const r = await nat('latest_download'); return say(r.ok ? `Opening ${r.name.slice(0, 50)}!` : "I couldn't find a recent download.", r.ok ? 'success' : 'oops', 4000); },
  explain_selection: async () => selTask('Explain this text simply in 2-3 short sentences.'),
  read_notes: async () => { const r = await nat('note_read'); return say(r.notes?.length ? 'Your latest notes: ' + r.notes.map(n => n.replace(/^\[[^\]]*\]\s*/, '')).join('. ') : "You don't have any notes yet.", 'neutral', 12000); },
  remind_at: async a => { const now = new Date(), t = new Date(now); let h = +a.hour; if (a.ampm === 'pm' && h < 12) h += 12; if (a.ampm === 'am' && h === 12) h = 0; t.setHours(h, +a.min || 0, 0, 0); if (t <= now) t.setDate(t.getDate() + 1); return ACT.set_timer({ minutes: (t - now) / 60000, label: a.label || 'Your reminder' }); },
  click_here: async () => { const p = Pointer.active ? { x: Math.round(Pointer.x), y: Math.round(Pointer.y) } : {}; const r = await nat('click', p); return say(r.ok ? 'Clicked!' : 'I could not click there.', r.ok ? 'success' : 'oops', 2000); },
  switch_window: async a => { const r = await nat('window', { act: 'focus', title: a.title }); return say(r.ok ? `Switched to ${(r.title || a.title).slice(0, 40)}!` : `I can't find a window called ${a.title}.`, r.ok ? 'success' : 'oops', 3000); },
  window_action: async a => { const go = async () => { const r = await nat('window', { act: a.act, title: a.title }); say(r.ok ? 'Done!' : 'That did not work.', r.ok ? 'success' : 'oops', 2500); }; if (a.act === 'close') return ask('Close this window?', go, () => say('Okay, leaving it open.', 'neutral', 2500)); return go(); },
  search_selection: async () => { const s = await selection(); if (!s) return say('Highlight some text first, and I will search it!', 'confused', 4000); await nat('web_search', { query: s.text.slice(0, 200) }); return say('Searching that for you!', 'working', 2500); },
  read_selection: async () => { const s = await selection(); if (!s) return say('Highlight some text first, and I will read it!', 'confused', 4000); return say(s.text.replace(/\s+/g, ' ').slice(0, 500), 'neutral', 15000); },
  press_n: async a => { const hwnd = await tgt(); const n = Math.min(20, Math.max(1, +a.times || 1)); for (let i = 0; i < n; i++) await nat('key', { combo: a.combo, hwnd }); return say('Done!', 'success', 1500); },
  write_text: async a => writeAtCursor(String(a.text || ''), !!a.enter),
  compose_text: async a => { if (!llmAvailable()) return needAI(); await say(pick(['Ooh, let me write something nice for you~', "Give me just a moment, I'll make it good!"]), 'thinking', 0);
    const t = await plain(`Write the following. Output only the text itself: ${a.instruction}`, '', 700); return t ? writeAtCursor(t) : say('My brain timed out, try again?', 'sad', 3000); },
  press_keys: async a => { const hwnd = await tgt(); const r = await nat('key', { combo: a.combo, hwnd }); return say(r.ok ? 'Done~' : `I couldn't press ${a.combo}.`, r.ok ? 'success' : 'oops', 2000); },
  scroll: async a => { const r = await nat('scroll', { amount: a.direction === 'up' ? 480 : -480 }); return say(r.ok ? 'Scrolling~' : 'Could not scroll.', 'neutral', 1800); },
  set_timer: async a => { const m = Math.max(.1, Number(a.minutes) || 1), label = a.label || 'your timer'; setTimeout(() => { Sound.celebrate(); nat('notify', { title: 'Pixie', body: label }); say(`Ding ding! ${label}, ${u()}!`, 'excited'); }, m * 60000); return say(`Timer set for ${m < 1 ? Math.round(m * 60) + ' seconds' : m + ' minutes'}~`, 'happy', 3000); },
  take_note: async a => { const r = await nat('note', { text: a.text }); return say(r.ok ? 'Noted and saved in Documents, Pixie, notes.' : 'I could not save that.', r.ok ? 'success' : 'oops', 3500); },
  open_folder: async a => { const r = await nat('open_folder', { folder: a.folder }); return say(r.ok ? `Opening ${a.folder}~` : 'I do not know that folder.', r.ok ? 'success' : 'oops', 2500); },
  system: async a => { if (a.what === 'battery') { const r = await nat('system', a); return say(r.pct == null ? "No battery here, you're plugged into the wall~" : `You're at ${r.pct} percent${r.charging ? ' and charging' : ''}.`, 'neutral', 4000); }
    const r = await nat('system', a); return say(r.ok ? (a.what === 'lock' ? 'Locking up, goodnight~' : 'Poof, all clear!') : 'That did not work.', r.ok ? 'success' : 'oops', 3000); },
  media: async a => { const r = await nat('key', { key: a.key }); return say(r.ok ? 'Got it~' : 'Could not do that.', r.ok ? 'success' : 'oops', 1800); },
  screenshot: async () => { const r = await nat('screenshot'); return say(r.ok ? 'Click! Saved in Pictures, Pixie.' : 'Screenshot failed.', r.ok ? 'success' : 'oops', 3000); },
  focus_mode: async () => focusMode(),
  read_clipboard: async () => { const r = await nat('clipboard_read'); return say(r.text ? `You copied: ${r.text.slice(0, 300)}` : 'Your clipboard is empty, silly.', 'neutral', 7000); },
  summarize_selection: async () => selTask('Summarize this text in 2-3 short sentences.'),
  translate_selection: async a => selTask(`Translate this text into ${a.language || 'English'}.`, true),
  rewrite_selection: async a => selTask(`Rewrite this text ${a.style ? 'in a ' + a.style + ' style' : 'to be clearer and fix grammar'}.`, true),
  calculate: async a => { const v = calc(a.expr); return say(v === null ? "Hmm, my math brain couldn't parse that." : `That's ${v}.`, v === null ? 'confused' : 'happy', 4000); },

  // ============ NEW: System & Window Management (5) ============
  minimize_window: async a => { const r = await nat('window', { act: 'min', title: a.title }); return say(r.ok ? 'Minimized!' : 'Could not minimize that window.', r.ok ? 'success' : 'oops', 2500); },
  maximize_window: async a => { const r = await nat('window', { act: 'max', title: a.title }); return say(r.ok ? 'Maximized!' : 'Could not maximize that window.', r.ok ? 'success' : 'oops', 2500); },
  restore_window: async a => { const r = await nat('window', { act: 'restore', title: a.title }); return say(r.ok ? 'Restored!' : 'Could not restore that window.', r.ok ? 'success' : 'oops', 2500); },
  close_window: async a => { const r = await nat('window', { act: 'close', title: a.title }); return say(r.ok ? 'Closed!' : 'Could not close that window.', r.ok ? 'success' : 'oops', 2500); },
  list_windows: async () => { const r = await nat('scan', { focus: false }); if (!r.ok) return say('Could not list windows.', 'oops', 3000); const titles = (r.els || []).map(e => e.n).filter(Boolean).slice(0, 20); return say(titles.length ? 'Open windows: ' + titles.join(', ') : 'No windows found.', 'neutral', 8000); },

  // ============ NEW: File Operations (5) ============
  create_file: async a => { const r = await nat('create_file', { path: a.path }); return say(r.ok ? `Created ${a.path}~` : 'Could not create file.', r.ok ? 'success' : 'oops', 3000); },
  read_file: async a => { const r = await nat('read_file', { path: a.path }); return say(r.ok ? `Contents of ${a.path}: ${r.text?.slice(0, 500)}` : 'Could not read file.', r.ok ? 'neutral' : 'oops', 8000); },
  write_file: async a => { const r = await nat('write_file', { path: a.path, text: a.text }); return say(r.ok ? `Wrote to ${a.path}~` : 'Could not write file.', r.ok ? 'success' : 'oops', 3000); },
  delete_file: async a => { const r = await nat('delete_file', { path: a.path }); return say(r.ok ? `Deleted ${a.path}` : 'Could not delete file.', r.ok ? 'success' : 'oops', 3000); },
  list_folder: async a => { const r = await nat('list_folder', { path: a.path || 'desktop' }); if (!r.ok) return say('Could not list folder.', 'oops', 3000); const items = (r.items || []).slice(0, 30).join(', '); return say(items ? `In ${a.path || 'Desktop'}: ${items}` : 'Folder is empty.', 'neutral', 8000); },

  // ============ NEW: Web & Search (5) ============
  scrape_page: async a => { if (!llmAvailable()) return needAI(); await say('Fetching page...', 'working', 0); const r = await window.aether.fetch({ url: a.url, timeout: 15000 }); if (!r.ok) return say('Could not fetch page.', 'oops', 3000); const out = await plain('Extract the main article/content from this HTML. Output only the readable text, no HTML tags, max 2000 chars.', r.text, 1500); return out ? say(out.slice(0, 600), 'neutral', 12000) : say('Could not extract content.', 'oops', 3000); },
  extract_links: async a => { if (!llmAvailable()) return needAI(); await say('Extracting links...', 'working', 0); const r = await window.aether.fetch({ url: a.url, timeout: 15000 }); if (!r.ok) return say('Could not fetch page.', 'oops', 3000); const out = await plain('Extract all unique URLs from this HTML. Output one per line, max 50.', r.text, 1000); return out ? say(out.slice(0, 600), 'neutral', 12000) : say('No links found.', 'oops', 3000); },
  summarize_page: async a => { if (!llmAvailable()) return needAI(); await say('Summarizing page...', 'thinking', 0); const r = await window.aether.fetch({ url: a.url, timeout: 15000 }); if (!r.ok) return say('Could not fetch page.', 'oops', 3000); const out = await plain('Summarize this page in 3-4 sentences. Focus on key points.', r.text, 500); return out ? say(out, 'happy', 10000) : say('Could not summarize.', 'oops', 3000); },
  search_site: async a => { await nat('web_search', { query: `site:${a.site} ${a.query}` }); return say(`Searching ${a.site} for "${a.query}"~`, 'thinking', 3000); },
  bookmark_page: async a => { const r = await nat('bookmark', { url: a.url }); return say(r.ok ? 'Bookmarked!' : 'Could not bookmark.', r.ok ? 'success' : 'oops', 3000); },

  // ============ NEW: Productivity (5) ============
  create_calendar_event: async a => { const r = await nat('calendar_create', { title: a.title, date: a.date, time: a.time }); return say(r.ok ? `Created event "${a.title}" for ${a.date} at ${a.time}` : 'Could not create event.', r.ok ? 'success' : 'oops', 4000); },
  list_calendar: async () => { const r = await nat('calendar_list'); return say(r.events?.length ? 'Upcoming: ' + r.events.slice(0, 10).map(e => `${e.title} (${e.date} ${e.time})`).join('; ') : 'No upcoming events.', 'neutral', 8000); },
  send_email: async a => { const r = await nat('send_email', { to: a.to, subject: a.subject, body: a.body }); return say(r.ok ? 'Email sent!' : 'Could not send email.', r.ok ? 'success' : 'oops', 4000); },
  create_todo: async a => { const r = await nat('todo_create', { text: a.text }); return say(r.ok ? 'Todo added!' : 'Could not add todo.', r.ok ? 'success' : 'oops', 3000); },
  list_todos: async () => { const r = await nat('todo_list'); return say(r.todos?.length ? 'Your todos: ' + r.todos.slice(0, 15).map(t => t.text).join('; ') : 'No todos.', 'neutral', 8000); },

  // ============ NEW: Media & Communication (5) ============
  play_music: async a => { const r = await nat('play_music', { query: a.query }); return say(r.ok ? `Playing ${a.query}~` : 'Could not play music.', r.ok ? 'success' : 'oops', 4000); },
  control_media: async a => { const r = await nat('media', { key: a.action }); return say(r.ok ? 'Done!' : 'Could not control media.', r.ok ? 'success' : 'oops', 2000); },
  send_message: async a => { const r = await nat('send_message', { to: a.to, body: a.body }); return say(r.ok ? 'Message sent!' : 'Could not send message.', r.ok ? 'success' : 'oops', 4000); },
  make_call: async a => { const r = await nat('make_call', { contact: a.contact }); return say(r.ok ? `Calling ${a.contact}...` : 'Could not make call.', r.ok ? 'success' : 'oops', 4000); },
  screenshot_region: async a => { const r = await nat('screenshot', { rect: a.rect }); return say(r.ok ? 'Screenshot saved!' : 'Could not take screenshot.', r.ok ? 'success' : 'oops', 3000); },

  // ============ NEW: Development (5) ============
  run_command: async a => { const r = await nat('run_command', { cmd: a.cmd }); return say(r.ok ? `Output: ${r.output?.slice(0, 400)}` : `Error: ${r.error}`, r.ok ? 'success' : 'oops', 5000); },
  git_status: async a => { const r = await nat('git_status', { path: a.path || '.' }); return say(r.ok ? r.output : 'Not a git repo.', r.ok ? 'neutral' : 'oops', 8000); },
  git_commit: async a => { const r = await nat('git_commit', { message: a.message, path: a.path || '.' }); return say(r.ok ? 'Committed!' : 'Could not commit.', r.ok ? 'success' : 'oops', 4000); },
  open_editor: async a => { const r = await nat('open_app', { app: 'code' }); if (r.ok && a.path) { await new Promise(z => setTimeout(z, 500)); await nat('paste', { text: a.path }); await nat('key', { combo: 'enter' }); } return say(r.ok ? 'Opened editor!' : 'Could not open editor.', r.ok ? 'success' : 'oops', 3000); },
  view_logs: async a => { const r = await nat('read_file', { path: a.path }); return say(r.ok ? r.text?.slice(0, 1000) : 'Could not read logs.', r.ok ? 'neutral' : 'oops', 8000); },

  // ============ NEW: Smart Home / IoT (3) ============
  control_light: async a => { const r = await nat('iot_light', { device: a.device, action: a.action }); return say(r.ok ? `Light ${a.action}` : 'Could not control light.', r.ok ? 'success' : 'oops', 3000); },
  get_sensor: async a => { const r = await nat('iot_sensor', { device: a.device }); return say(r.ok ? `${a.device}: ${r.value}` : 'Could not read sensor.', r.ok ? 'neutral' : 'oops', 4000); },
  set_thermostat: async a => { const r = await nat('iot_thermostat', { temp: a.temp }); return say(r.ok ? `Set to ${a.temp}°` : 'Could not set thermostat.', r.ok ? 'success' : 'oops', 3000); },

  // ============ NEW: AI-Powered (5) ============
  analyze_image: async a => { if (!routeChain('vision').length) return needVision(); await say('Analyzing image...', 'thinking', 0); const r = await askVision(a.prompt || 'Describe this image in detail.', { rect: a.rect }); return r ? say(r.text, 'happy', 10000) : say('Could not analyze.', 'oops', 3000); },
  generate_code: async a => { if (!llmAvailable()) return needAI(); await say('Generating code...', 'thinking', 0); const out = await plain(`Write clean, complete code for: ${a.spec}. Output only the code.`, '', 2000); return out ? writeAtCursor(out) : say('Could not generate.', 'oops', 3000); },
  explain_code: async a => { if (!llmAvailable()) return needAI(); await say('Explaining code...', 'thinking', 0); const out = await plain(`Explain this code simply in 3-4 sentences.`, a.code, 700); return out ? say(out, 'neutral', 10000) : say('Could not explain.', 'oops', 3000); },
  refactor_code: async a => { if (!llmAvailable()) return needAI(); await say('Refactoring...', 'thinking', 0); const out = await plain(`Refactor this code to be cleaner and more maintainable. Output only the improved code.`, a.code, 2000); return out ? writeAtCursor(out) : say('Could not refactor.', 'oops', 3000); },
  write_tests: async a => { if (!llmAvailable()) return needAI(); await say('Writing tests...', 'thinking', 0); const out = await plain(`Write unit tests for this code. Output only the test code.`, a.code, 2000); return out ? writeAtCursor(out) : say('Could not write tests.', 'oops', 3000); },

  
  // ============ NEW: Voice-Activated Task Management ============
  add_task: async a => {
    const phrase = a.phrase;
    const actionType = a.actionType;
    const actionValue = a.actionValue;
    if (!phrase || !actionType || !actionValue) {
      return say('I need a phrase, action type, and value to create the task.', 'confused', 4000);
    }
    // Check if phrase already exists
    const existing = (S.macros || []).find(m => m.phrase?.toLowerCase() === phrase.toLowerCase());
    if (existing) {
      return say(`There's already a task called "${phrase}". Say "edit task ${phrase}" to change it.`, 'worried', 5000);
    }
    const newMacro = { phrase, action: { type: actionType, value: actionValue } };
    S.macros = [...(S.macros || []), newMacro];
    save();
    return say(`Created task "${phrase}"! When you say that, I'll ${actionType} ${actionValue}.`, 'success', 5000);
  },
  edit_task: async a => {
    const phrase = a.phrase;
    const actionType = a.actionType;
    const actionValue = a.actionValue;
    if (!phrase) {
      return say('Which task would you like to edit? Say "edit task [name]".', 'confused', 4000);
    }
    const idx = (S.macros || []).findIndex(m => m.phrase?.toLowerCase() === phrase.toLowerCase());
    if (idx === -1) {
      return say(`I couldn't find a task called "${phrase}".`, 'worried', 4000);
    }
    if (actionType && actionValue) {
      S.macros[idx].action = { type: actionType, value: actionValue };
    } else if (actionType || actionValue) {
      return say('Please provide both the action type and value to edit.', 'confused', 4000);
    }
    save();
    return say(`Updated task "${phrase}"!`, 'success', 4000);
  },
  delete_task: async a => {
    const phrase = a.phrase;
    if (!phrase) {
      return say('Which task would you like to delete? Say "delete task [name]".', 'confused', 4000);
    }
    const idx = (S.macros || []).findIndex(m => m.phrase?.toLowerCase() === phrase.toLowerCase());
    if (idx === -1) {
      return say(`I couldn't find a task called "${phrase}".`, 'worried', 4000);
    }
    const removed = S.macros.splice(idx, 1)[0];
    save();
    return say(`Deleted task "${removed.phrase}".`, 'success', 4000);
  },
  list_tasks: async () => {
    const macros = S.macros || [];
    if (!macros.length) {
      return say('You have no custom tasks yet. Say "add task [name] that [action]" to create one!', 'happy', 6000);
    }
    const list = macros.map(m => `"${m.phrase}" -> ${m.action.type} ${m.action.value}`).join('; ');
    return say(`Your custom tasks: ${list}`, 'neutral', 10000);
  },

};
for (const k of Object.keys(ACT)) { const f = ACT[k]; ACT[k] = async a => { if (!['focus_mode', 'click_ui', 'write_text', 'compose_text'].includes(k)) setEmotion('working'); return f(a); }; }
export async function runActions(list) { for (const a of (list || []).slice(0, 4)) { const f = ACT[a?.name]; if (f) await f(a.args || {}); } }
export async function runBinding(a) {
  const v = a.value || ''; ({ say: () => say(v, 'happy'), emotion: () => { react(v || 'happy', 4000); }, command: () => dispatchAgentTask(v), open: () => ACT.open_app({ app: v }), url: () => ACT.open_url({ url: v }),
    key: () => ACT.press_keys({ combo: v }), webhook: () => window.aether.fetch({ url: v, method: 'POST', json: { source: 'pixie', time: Date.now() }, timeout: 8000 }) }[a.type] || (() => {}))();
}

// ---------- intro + offline commands ----------
async function intro() {
  const my = ++Agent.token, alive = () => my === Agent.token; Sound.wake(); Agent.expand(9000); react('greeting', 4500);
  await say(`Hi ${u()}! I'm Pixie, your friendly desktop buddy. I'm so happy to meet you!`, 'excited'); if (!alive()) return;
  await say('I can see your hands and face, hear you when you say hello Pixie, and help by clicking, typing, searching and opening things.', 'happy'); if (!alive()) return;
  burst('hearts', 12); Sound.chime(); await say('Show me a finger heart any time, I love those! So, what shall we do together?', 'love');
}
const FEEL = { cheer: ['Hey {u}, you are doing better than you think. I am proud of you!', 'Come here, {u}. Deep breath with me. You have totally got this!', 'Tired? That is okay. Sip some water, stretch a bit, and I will cheer you on!'] };
const COMMANDS = [
  [/\b(introduce yourself|run intro|who are you|what are you|tell me about yourself)\b/, () => intro()],
  [/\b(status report|diagnostics?|system status)\b/, () => say(`Tracking at ${Vision.fps} frames per second, ${Vision.latency} milliseconds latency, ${Vision.mode}. You look ${Vision.userMood}, and we have finished ${Agent.tasks} tasks today. Great teamwork!`, 'happy', 7000)],
  [/\b(stop|cancel|end) (the )?(timer|focus)/, () => { Agent.focusEnd = 0; return say('Timer stopped~', 'neutral', 2500); }],
  [/\b(focus mode|lock in|start (the |a )?(timer|pomodoro)|pomodoro|deep work)\b/, () => ACT.focus_mode()],
  [/\b(cheer me up|i'?m (so |really )?(tired|sad|stressed|down|exhausted|bored)|give me (some )?love|motivate me)\b/, () => { react('happy', 6000); burst('hearts', 24); Sound.chime(); return say(pick(FEEL.cheer).replace('{u}', u()), 'adoring', 7000); }],
  [/\b(take|grab|capture) (a )?screen ?shot\b|^screenshot$/, () => ACT.screenshot()],
  [/\b(what'?s|what is|describe|look at|read) (on )?(my |the )?screen\b/, () => ACT.describe_screen()],
  [/\b(summari[sz]e)\b.*\b(this|that|selection|selected|text|it)\b|\bsummari[sz]e (my )?selection\b/, () => ACT.summarize_selection()],
  [/\btranslate (this|that|selection|the selected text)(?: (?:to|into) (\w+))?/, m => ACT.translate_selection({ language: m[2] })],
  [/\b(rewrite|fix|improve|proofread) (this|that|my selection|the selected text|my text)\b/, () => ACT.rewrite_selection({})],
  [/\bread (my |the )?clipboard\b|\bwhat did i copy\b/, () => ACT.read_clipboard()],
  [/\b(volume up|louder|turn (it )?up)\b/, async () => { for (let i = 0; i < 5; i++) await nat('key', { key: 'volume_up' }); return say('Louder, got it~', 'happy', 1800); }],
  [/\b(volume down|quieter|turn (it )?down)\b/, async () => { for (let i = 0; i < 5; i++) await nat('key', { key: 'volume_down' }); return say('Shhh, quieter~', 'neutral', 1800); }],
  [/\b(mute|unmute)\b/, () => ACT.media({ key: 'volume_mute' })], [/\b(next (song|track)|skip (this )?(song|track))\b/, () => ACT.media({ key: 'media_next' })],
  [/\b(previous (song|track)|go back a song)\b/, () => ACT.media({ key: 'media_prev' })], [/\b(pause|play|resume) (the )?(music|song|media|video)\b/, () => ACT.media({ key: 'media_play' })],
  [/\b(minimi[sz]e (everything|all)|show (the )?desktop)\b/, () => ACT.system({ what: 'minimize_all' })], [/\block (my |the )?(screen|computer|pc)\b/, () => ACT.system({ what: 'lock' })],
  [/\bbattery\b/, () => ACT.system({ what: 'battery' })], [/\bopen (my |the )?(documents|downloads|desktop|pictures|music|videos)( folder)?\b/, m => ACT.open_folder({ folder: m[2] })],
  [/\b(set (a |the )?timer|remind me) (?:for |in )?(\d+(?:\.\d+)?)\s*(second|sec|minute|min|hour)s?(?: (?:to|that|about) (.+))?/, m => ACT.set_timer({ minutes: +m[3] * (/^s/.test(m[4]) ? 1 / 60 : /^h/.test(m[4]) ? 60 : 1), label: m[5] ? 'Reminder: ' + m[5] : 'Your timer is done' })],
  [/^(?:please )?(?:take a note|note down|note that|remember that|make a note)[:,]?\s*(.+)$/, m => ACT.take_note({ text: m[1] })],
  [/^(?:please )?(?:scroll|go) (up|down)\b/, m => ACT.scroll({ direction: m[1] })], [/^(?:please )?page (up|down)\b/, m => ACT.scroll({ direction: m[1] })],
  [/^(?:please )?(?:press|hit)\s+((?:(?:ctrl|control|alt|shift)\s*(?:\+|plus)?\s*)+(?:[a-z0-9]|f\d{1,2}|enter|tab|esc|escape|delete|backspace|up|down|left|right|home|end|space))$/, m => ACT.press_keys({ combo: m[1].replace(/\s*plus\s*|\s+/g, '+').replace(/\+\+/g, '+') })],
  [new RegExp('^(?:please )?(?:press |hit |do )?(' + Object.keys(KEYMAP).join('|') + ')( that| it)?$'), m => ACT.press_keys({ combo: KEYMAP[m[1]] })],
  [/^(?:read|transcribe) (?:the )?(?:text )?(?:on )?(?:my |the )?screen$|\bwhat does (?:my |the )?screen say\b|\bread (?:everything|all the text) on (?:my |the )?screen\b/, () => ACT.read_screen()],
  [/\bdescribe (?:this|the active|the current) window\b|\bwhat'?s in (?:this|the) window\b/, () => ACT.describe_window()],
  [/\bwhat am i pointing at\b|\bwhat'?s (?:this|here)\b.*\bpointing\b|\bdescribe (?:this|here)$|\bwhat is (?:this|that) (?:thing|here)\b/, () => ACT.describe_here()],
  [/\bexplain (?:this|that|the) (?:error|message|popup|dialog|page|screen|warning)\b|\bwhat'?s (?:this|that) (?:error|message|popup|dialog|warning)\b|\bwhat does (?:this|that) (?:error|message) mean\b/, () => ACT.ask_screen({ question: 'Explain what this is and what the user should do about it.' })],
  [/^(?:where(?:'s| is)|locate|show me where)\s+(?:the |my )?(.+?)(?: is)?(?: on (?:the |my )?screen)?$|^find (?:the )?(.+?) on (?:the |my )?screen$/, m => ACT.find_on_screen({ what: m[1] || m[2] })],
  [/^(?:ask|tell) (?:me )?(?:about )?(?:my )?screen[: ]+(.+)$|\bon (?:my |the )?screen,? (?:what|which|who|how|is|are) (.+)$/, m => ACT.ask_screen({ question: m[1] || m[2] })],
  [/^(?:type|enter|put|fill(?: in)?)\s+(.+?)\s+(?:in|into|on) (?:the )?(.+?)(?: field| box| bar)?$/, m => ACT.type_into({ text: m[1], target: m[2] })],
  [/^copy\s+(?:the (?:text|words) )?["']?(.+?)["']? to (?:the )?clipboard$/, m => ACT.copy_text({ text: m[1] })],
  [/\b(?:set|put|change) (?:the )?volume (?:to|at) (\d{1,3})(?:\s*(?:percent|%))?|\bvolume (\d{1,3})(?:\s*(?:percent|%))?$/, m => ACT.set_volume({ percent: m[1] || m[2] })],
  [/^(?:please )?snap (?:this |the )?(?:window )?(left|right|up|down|maximi[sz]e)\b|^(?:put|move) (?:this )?window (?:on |to )?(?:the )?(left|right)(?: side| half)?$/, m => ACT.snap_window({ dir: /max/.test(m[1] || '') ? 'up' : (m[1] || m[2]) })],
  [/\b(?:what'?s|how'?s|what is) the weather(?: like)?(?: (?:in|at|for) ([a-z ]+?))?(?: today| now| right now)?$|^weather(?: (?:in|for) ([a-z ]+))?$/, m => ACT.weather({ city: (m[1] || m[2] || '').trim() })],
  [/^(?:please )?(?:email|send an email to|compose an email to|draft an email to)\s+(.+?)(?:\s+(?:about|saying|regarding|that)\s+(.+))?$/, m => ACT.compose_email({ to: m[1], instruction: m[2] || (m[1].includes('@') ? '' : m[1]) })],
  [/\b(?:open|show) (?:my |the )?(?:latest|last|newest|most recent) download\b/, () => ACT.open_latest_download()],
  [/\bexplain (?:this|that|the selection|what i (?:selected|highlighted))\b/, () => ACT.explain_selection()],
  [/\bremind me (?:at|by) (\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?: (?:to|that|about) (.+))?/, m => ACT.remind_at({ hour: m[1], min: m[2], ampm: m[3], label: m[4] ? 'Reminder: ' + m[4] : '' })],
  [/\b(?:read|show|what are) (?:me )?(?:my )?(?:last |latest |recent )?notes\b/, () => ACT.read_notes()],
  [/\bscroll to (?:the )?(top|bottom)\b|^go to (?:the )?(top|bottom)(?: of (?:the )?page)?$/, m => ACT.press_keys({ combo: (m[1] || m[2]) === 'top' ? 'ctrl+home' : 'ctrl+end' })],
  [/^(?:please )?zoom (in|out)$|^(reset) zoom$/, m => ACT.press_keys({ combo: m[1] === 'in' ? 'ctrl+=' : m[1] === 'out' ? 'ctrl+-' : 'ctrl+0' })],
  [/^(?:please )?(double|right)[ -]?click\s+(?:on |the )?(.+)$/, m => ACT.click_ui(m[1] === 'double' ? { target: m[2], double: true } : { target: m[2], button: 'right' })],
  [/^(?:please )?(?:click|tap|select|press)\s+(?:this|here|that|it)$/, () => ACT.click_here()],
  [/^(?:please )?(?:switch|go|jump|alt tab) to\s+(.+)$/, m => ACT.switch_window({ title: m[1].replace(/^(the|my)\s+/, '').replace(/\s+(window|app)$/, '') })],
  [/^(?:please )?(maximi[sz]e|minimi[sz]e|restore|close)\s+(?:this |the |my )?(?:window|app)$/, m => ACT.window_action({ act: /^max/.test(m[1]) ? 'max' : /^min/.test(m[1]) ? 'min' : m[1] === 'restore' ? 'restore' : 'close' })],
  [/\bsearch (?:for )?(?:this|the selection|selected text|what i selected|what i highlighted)\b/, () => ACT.search_selection()],
  [/\bread (?:this|the selection|selected text|that|what i selected) ?(?:out loud|aloud)?$/, () => ACT.read_selection()],
  [/^(?:please )?(?:press|hit)\s+(\w+)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+times?$/, m => { const w = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }; const k = KEYMAP[m[1]] || m[1]; return ACT.press_n({ combo: k, times: w[m[2]] || +m[2] }); }],
  [/^(?:please )?(?:click|tap|press|hit|select|choose)\s+(?:on |the )?(.+?)(?: button| link| icon)?$/, m => ACT.click_ui({ target: m[1] })],
  [/^(?:please )?(?:write|compose|draft|generate|create)\s+(?:me\s+)?(?:an?|the|some)\s+(.+)$/, m => ACT.compose_text({ instruction: m[0].replace(/^please /, '') })],
  [/^(?:please )?(?:type|write|enter|dictate|input)\s+(.+)$/, m => ACT.write_text({ text: m[1] })],
  [/^(?:please )?search(?: for)?\s+(.+)$|^google\s+(.+)$|^look up\s+(.+)$/, m => ACT.web_search({ query: m[1] || m[2] || m[3] })],
  [/^(?:please )?play\s+(.+?)(?:\s+on youtube)?$/, m => ACT.open_url({ url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(m[1]) })],
  [/^(?:please )?(?:go to|visit|browse to)\s+(\S+\.\S+)$/, m => ACT.open_url({ url: 'https://' + m[1].replace(/^https?:\/\//, '') })],
  [/^(?:please )?(?:open|launch|start|run)\s+(?!settings\b)(.+)$/, m => ACT.open_app({ app: m[1] })],
  [/\b(open|show) (the )?(settings|studio|configuration)\b|\bconfigure (api|apis|providers?)\b/, () => { Agent.openSettings(); return say('Here are my settings!', 'happy', 3000); }],
  [/\bwhat('?s| is) the (time|date)\b|\bwhat time is it\b|\bwhat day is it\b/, () => { const n = new Date(); return say(`It's ${n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} on ${n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`, 'happy'); }],
  [/\b(tell me a joke|joke)\b/, () => say(pick(['Why do programmers love dark mode? Because light attracts bugs!', 'I told my computer I needed a break, and it sent me a cat video. Best reply ever!']), 'laughing')],
  [/^(stop|quiet|be quiet|shush|enough)\b/, () => { Agent.token++; stopSpeaking(); setEmotion('neutral'); }],
  [/\b(go to sleep|good ?night|sleep now|take a nap)\b/, async () => { await say(`Good night, ${u()}... sleep well. See you soon! zzz...`, 'sleepy', 0); fallAsleep(); }],
  [/\b(thank you|thanks)\b/, () => say(pick([`You're so welcome, ${u()}!`, 'Anytime! I love helping you.']), 'happy')],
  [/\b(you'?re|you are) (so |very )?(cute|pretty|adorable|amazing|the best|nice|kind|great)\b|\bi love you\b/, () => { burst('hearts', 12); Sound.chime(); return say(pick(["Aww, you're making me blush! Thank you!", 'That is so sweet, ' + u() + '! You are wonderful too!']), 'blushing', 6000); }],
  [/\bhow are you\b|\bhow'?s it going\b/, () => say(`I'm great, especially now that you're here, ${u()}! How is your day going?`, 'happy')],
  [/\b(i had a (bad|rough|hard) day|i'?m having a (bad|rough|hard) day)\b/, () => say(`Oh no, I'm sorry, ${u()}. I'm here with you. Want to take a little break together?`, 'worried', 7000)],
  [/\b(good|great|awesome|fine|wonderful) (day|today)\b|i'?m (good|great|happy|fine)\b/, () => { burst('sparkles', 10); return say('Yay, I love hearing that! Let us make it even better!', 'joyful'); }],
  [/^(?:call me|my name is|i am called|you can call me)\s+([a-z][a-z' ]{1,20})$/, m => { S.user = m[1].trim().replace(/\b\w/g, c => c.toUpperCase()); save(); return say(`Nice to meet you, ${S.user}! I'll call you that from now on.`, 'excited'); }],
  [/^(hi|hello|hey|yaho|good (morning|afternoon|evening))\b/, () => { react('greeting', 3500); return say(pick([`Hi ${u()}! So good to see you!`, `Hello ${u()}! What can I do for you?`]), 'greeting'); }],
  [/\bwhat can you do\b|^help$/, () => say('I can open apps and sites, search, click buttons, type for you, scroll, set timers, take notes, and summarize or translate your selected text. Just say hello Pixie!', 'happy', 9000)],
  [/^(?:what is|what's|calculate|compute|how much is)\s+(.+?)\??$/, m => { const v = calc(m[1]); return v === null ? null : ACT.calculate({ expr: m[1] }); }],

  // ============ NEW: System & Window Management ============
  [/^(?:please )?minimi[sz]e (?:the |my )?window\b|^minimi[sz]e window$/, () => ACT.minimize_window({})],
  [/^(?:please )?maximi[sz]e (?:the |my )?window\b|^maximi[sz]e window$/, () => ACT.maximize_window({})],
  [/^(?:please )?restore (?:the |my )?window\b|^restore window$/, () => ACT.restore_window({})],
  [/^(?:please )?close (?:the |my )?window\b|^close window$/, () => ACT.close_window({})],
  [/\blist (?:open |all )?windows\b|\bwhat windows (?:are )?open\b/, () => ACT.list_windows()],

  // ============ NEW: File Operations ============
  [/^(?:please )?create (?:a |new )?file (.+)$/, m => ACT.create_file({ path: m[1] })],
  [/^(?:please )?read file (.+)$|\bread (.+) file\b/, m => ACT.read_file({ path: m[1] })],
  [/^(?:please )?write (?:to |in )?file (.+?) (?:with |:)(.+)$/, m => ACT.write_file({ path: m[1], text: m[2] })],
  [/^(?:please )?delete file (.+)$|\bremove file (.+)\b/, m => ACT.delete_file({ path: m[1] })],
  [/^(?:please )?list (?:files in |folder )?(.+)$|\bwhat'?s in (.+)\b/, m => ACT.list_folder({ path: m[1] })],

  // ============ NEW: Web & Search ============
  [/^(?:please )?scrape (.+)$/, m => ACT.scrape_page({ url: m[1] })],
  [/^(?:please )?extract links from (.+)$/, m => ACT.extract_links({ url: m[1] })],
  [/^(?:please )?summarize (.+)$/, m => ACT.summarize_page({ url: m[1] })],
  [/^(?:please )?search (.+) on (.+)$/, m => ACT.search_site({ query: m[1], site: m[2] })],
  [/^(?:please )?bookmark (.+)$/, m => ACT.bookmark_page({ url: m[1] })],

  // ============ NEW: Productivity ============
  [/^(?:please )?create (?:calendar |)(?:event|meeting) (.+?) (?:on |for )(.+?) (?:at |)(.+)$/, m => ACT.create_calendar_event({ title: m[1], date: m[2], time: m[3] })],
  [/\blist (?:calendar|events|schedule)\b/, () => ACT.list_calendar()],
  [/^(?:please )?send email to (.+?) (?:about |with subject |)(.+)?$/, m => ACT.send_email({ to: m[1], subject: m[2] || '', body: m[2] || '' })],
  [/^(?:please )?add todo (.+)$|\bcreate todo (.+)\b/, m => ACT.create_todo({ text: m[1] })],
  [/\blist todos\b|\bmy todos\b/, () => ACT.list_todos()],

  // ============ NEW: Media & Communication ============
  [/^(?:please )?play (.+) (?:music|song|track)\b/, m => ACT.play_music({ query: m[1] })],
  [/\b(play|pause|next|previous|skip) (?:the )?(music|song|track|media)\b/, m => ACT.control_media({ action: m[1] === 'next' ? 'media_next' : m[1] === 'previous' ? 'media_prev' : m[1] === 'skip' ? 'media_next' : 'media_play' })],
  [/^(?:please )?send (?:a |)(?:message|text) to (.+?) (?:saying |)(.+)$/, m => ACT.send_message({ to: m[1], body: m[2] })],
  [/^(?:please )?call (.+)$/, m => ACT.make_call({ contact: m[1] })],
  [/^(?:please )?screenshot (?:region|area) (.+)$/, m => { const coords = m[1].split(/\s+/).map(Number); return ACT.screenshot_region({ rect: { x: coords[0], y: coords[1], w: coords[2], h: coords[3] } }); }],

  // ============ NEW: Development ============
  [/^(?:please )?run (?:command|cmd) (.+)$/, m => ACT.run_command({ cmd: m[1] })],
  [/\bgit status\b/, m => ACT.git_status({ path: m[1] })],
  [/^(?:please )?git commit (.+)$/, m => ACT.git_commit({ message: m[1] })],
  [/^(?:please )?open (?:editor|vscode|code)(?: at (.+))?$/, m => ACT.open_editor({ path: m[1] })],
  [/^(?:please )?view logs (.+)$/, m => ACT.view_logs({ path: m[1] })],

  // ============ NEW: Smart Home / IoT ============
  [/^(?:please )?turn (on|off) (?:the |)(.+) light\b/, m => ACT.control_light({ device: m[2], action: m[1] })],
  [/^(?:please )?(?:get|read) (?:the |)(.+) sensor\b/, m => ACT.get_sensor({ device: m[1] })],
  [/^(?:please )?set (?:the |)(?:thermostat|temperature) to (\d+)\b/, m => ACT.set_thermostat({ temp: +m[1] })],

  // ============ NEW: AI-Powered ============
  [/^(?:please )?analyze (?:this |the )?image (.+)$/, m => ACT.analyze_image({ url: m[1] })],
  [/^(?:please )?generate code (?:for |)(.+)$/, m => ACT.generate_code({ spec: m[1] })],
  [/^(?:please )?explain (?:this |the )?code (.+)$/, m => ACT.explain_code({ code: m[1] })],
  [/^(?:please )?refactor (?:this |the )?code (.+)$/, m => ACT.refactor_code({ code: m[1] })],
  [/^(?:please )?write tests (?:for |)(.+)$/, m => ACT.write_tests({ code: m[1] })],

  // ============ NEW: Voice-Activated Task Management ============
  [/^(?:please )?add task (.+?) that (.+?) (.+)$/, m => ACT.add_task({ phrase: m[1].trim(), actionType: m[2].trim(), actionValue: m[3].trim() })],
  [/^(?:please )?edit task (.+?) to (.+?) (.+)$/, m => ACT.edit_task({ phrase: m[1].trim(), actionType: m[2].trim(), actionValue: m[3].trim() })],
  [/^(?:please )?delete task (.+)$/, m => ACT.delete_task({ phrase: m[1].trim() })],
  [/^(?:please )?list tasks?\b|\bshow (?:my |)tasks?\b/, () => ACT.list_tasks()],
];
function offline(text) { const t = text.toLowerCase().replace(/[?!.,]+$/g, '').trim(); for (const [re, fn] of COMMANDS) { const m = re.exec(t); if (m) return () => fn(m, t); } return null; }
const dsc = (a, b) => dice(a.toLowerCase(), b.toLowerCase());
function macro(text) { const t = text.toLowerCase().replace(/[?!.,]+$/g, '').trim(); return (S.macros || []).find(m => m.phrase && (t === m.phrase.toLowerCase() || t.includes(m.phrase.toLowerCase()) || dsc(t, m.phrase) >= .85)); }
function parsePlan(txt) { try { return JSON.parse(txt); } catch {} const m = /\{[\s\S]*\}/.exec(txt); if (m) { try { return JSON.parse(m[0]); } catch {} } return { say: txt.replace(/```[a-z]*|```/g, '').trim(), emotion: 'happy', actions: [] }; }

// ---------- entry point ----------
export async function dispatchAgentTask(input) {
  const text = (input || '').trim(); if (!text) return; addMessage('user', text); Agent.expand(); Agent.caption('You: ' + text);
  const t = text.toLowerCase().replace(/[?!.,]+$/g, '').trim();
  const cleaned = clean(text);
  if (P.cur) { if (/^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|confirm|please|correct|that one|right)\b/.test(t)) return resolvePending(true); if (/^(no|nope|nah|cancel|don'?t|wrong|not that)\b/.test(t)) return resolvePending(false); resolvePending(false); hlClear(); }
  const mac = macro(cleaned); if (mac) return runBinding(mac.action);
  const off = offline(cleaned); if (off) { const r = off(); if (r !== null && r !== undefined) return r; }
  if (llmAvailable()) {
    setEmotion('thinking'); Agent.busy(true); Agent.history.push({ role: 'user', content: text }); Agent.history = Agent.history.slice(-8);
    const out = await completion(/\b(open|launch|search|click|type|write|press|scroll|take|set|remind|find|go to|play|close|minimi)/i.test(text) ? 'agent' : 'chat', [{ role: 'system', content: SYSTEM() }, ...Agent.history]);
    if (out) { const p = parsePlan(out); Agent.history.push({ role: 'assistant', content: out }); const emo = EMOTIONS.includes(p.emotion) ? p.emotion : 'happy';
      if (p.say) await say(p.say, emo, 6000); await runActions(p.actions); return; }
  }
  return say(llmAvailable() ? `I'm having a little trouble thinking, ${u()}. Could you try again?` : `I only know my built-in tricks offline, ${u()}. Add a free Groq key in Settings and I can help with anything!`, 'worried', 6000);
}
export const focusLeft = () => Agent.focusEnd ? Math.max(0, Math.round((Agent.focusEnd - Date.now()) / 1000)) : 0;