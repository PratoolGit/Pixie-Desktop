// Live animation of the ORIGINAL art: a WebGL mesh warp (Live2D-style). The illustration is deformed smoothly every frame:
// head turn/nod, hair sway with follow-through, ahoge, ribbons, sleeves, breathing, jaw drop while speaking, blinking and eye gaze.
// A second texture (the animated lips) is warped by the same mesh, so the mouth stays attached to the face.
// An optional video (assets/anim/<emotion>.webm/.mp4) can replace the still image for any emotion.
const NX = 26, NY = 30;
const VS = 'attribute vec2 aUV; attribute vec2 aPos; uniform vec4 uRect; varying vec2 vUV; void main(){ vUV=aUV; vec2 p=vec2(uRect.x+aPos.x*uRect.z, uRect.y+aPos.y*uRect.w); gl_Position=vec4(p.x*2.-1., 1.-p.y*2., 0., 1.); }';
const FS = 'precision mediump float; varying vec2 vUV; uniform sampler2D uA, uB, uO; uniform float uMix, uOv; void main(){ vec4 a=texture2D(uA,vUV), b=texture2D(uB,vUV); vec4 c=mix(a,b,uMix); vec4 o=texture2D(uO,vUV)*uOv; gl_FragColor=o+c*(1.-o.a); }';
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gs = (dx, dy, rx, ry) => Math.exp(-(dx * dx / (rx * rx) + dy * dy / (ry * ry)));

export function createLive(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true }); if (!gl) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
  gl.useProgram(pr); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const nv = (NX + 1) * (NY + 1), uv = new Float32Array(nv * 2), pos = new Float32Array(nv * 2), idx = new Uint16Array(NX * NY * 6);
  for (let j = 0, k = 0; j <= NY; j++) for (let i = 0; i <= NX; i++, k += 2) { uv[k] = i / NX; uv[k + 1] = j / NY; }
  for (let j = 0, k = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.set([a, b, c, b, d, c], k); k += 6; }
  const buf = (data, loc, dyn) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, loc); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); return b; };
  buf(uv, 'aUV'); const posBuf = buf(pos, 'aPos', true);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const U = n => gl.getUniformLocation(pr, n); gl.uniform1i(U('uA'), 0); gl.uniform1i(U('uB'), 1); gl.uniform1i(U('uO'), 2);
  const mkTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return t; };
  const cache = new Map();
  const get = url => { let e = cache.get(url); if (e) return e; e = { t: mkTex(), w: 1, h: 1, ready: false }; cache.set(url, e); const img = new Image(); img.onload = () => { gl.bindTexture(gl.TEXTURE_2D, e.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); e.w = img.naturalWidth; e.h = img.naturalHeight; e.ready = true; }; img.src = url; return e; };
  const blank = { t: mkTex(), w: 1, h: 1 }, ovTex = mkTex(); let ovOn = false;
  let A = blank, B = blank, mix = 0, mixFrom = 0, mixMs = 0, video = null, vt = null;
  const rectFor = () => { const w = A.w || 1, h = A.h || 1, ar = w / h, cw = canvas.width, ch = canvas.height, rh = Math.min(ch * .98, cw / ar), rw = rh * ar; return [(cw - rw) / 2 / cw, (ch - rh) / ch, rw / cw, rh / ch]; };
  function resize() { const d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, Math.round(canvas.clientWidth * d)), h = Math.max(2, Math.round(canvas.clientHeight * d)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, canvas.width, canvas.height); }
  const out = [0, 0];
  function warp(u, v, P) {
    let x = u, y = v;
    const wh = 1 - sm(.42, .74, v);                                    // head weight: 1 on the head, 0 on the body, smooth in between (no seams)
    if (wh > 0) { const a = P.rot * wh, c = Math.cos(a), s = Math.sin(a), dx = x - .5, dy = y - .68; x = .5 + dx * c - dy * s; y = .68 + dx * s + dy * c; x += P.yaw * .012 * wh; y += P.nod * .018 * wh; }
    const gf = gs(u - .5, v - .57, .22, .2); x += P.yaw * .03 * gf; y += P.pitch * .02 * gf;   // facial features slide more than the outline: a head-turn illusion
    const edge = sm(.36, .12, u) + sm(.64, .88, u), wl = sm(.4, .95, v) * edge, ha = P.hairAmp;   // hair sways with follow-through
    x += (Math.sin(P.t * 1.7 + (u < .5 ? 0 : 2) + v * 4) * .009 + Math.sin(P.t * 2.9 + v * 7) * .003) * wl * ha; y += Math.sin(P.t * 1.7 + v * 3) * .003 * wl * ha;
    const ga = gs(u - .52, v - .06, .07, .08); x += (Math.sin(P.t * 2.7) * .014 + P.rot * .25) * ga; y += Math.cos(P.t * 2.2) * .004 * ga;   // ahoge
    const gr = gs(u - .13, v - .82, .1, .08) + gs(u - .87, v - .8, .1, .08); x += Math.sin(P.t * 3.1 + u * 9) * .01 * gr * ha; y += Math.cos(P.t * 2.6 + u * 7) * .007 * gr;   // ribbons
    x += Math.sin(P.t * 1.1 + v * 2) * .004 * sm(.62, 1, v); y = 1 - (1 - y) * (1 + P.breath);        // sleeves + breathing
    if (P.jaw) { y += P.jaw * gs(u - P.mx, v - P.my, .12, .1) + P.jaw * .4 * gs(u - P.mx, v - P.my - .05, .2, .09); }   // jaw follows the open mouth
    for (let k = 0; k < P.eyes.length; k++) { const e = P.eyes[k], g = gs(u - e.x, v - e.y, e.rx * 1.1, e.ry * 1.25); if (g > .01) { x += P.lookx * .007 * g; y += P.looky * .005 * g; y = e.y + (y - e.y) * (1 - .9 * P.blink * g); } }   // gaze + blink
    out[0] = x; out[1] = y;
  }
  return {
    ok: true, resize,
    setSprite(url, fadeMs = 160) { const t = get(url); if (t === A && !mixMs) return; B = A; A = t; if (fadeMs > 0 && B !== blank) { mix = 1; mixMs = fadeMs; mixFrom = performance.now(); } else { mix = 0; mixMs = 0; } video = null; },
    setVideo(el) { video = el; if (!vt) vt = { t: mkTex(), w: 1, h: 1, ready: false }; B = A; A = vt; mix = 0; mixMs = 0; },
    setOverlay(cv) { ovOn = !!cv; if (cv) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ovTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); } },
    spriteSize: () => [A.w, A.h],
    render(P) {
      resize(); if (video && video.readyState >= 2) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vt.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); vt.w = video.videoWidth; vt.h = video.videoHeight; }
      if (mixMs) { const k = (performance.now() - mixFrom) / mixMs; mix = Math.max(0, 1 - k); if (k >= 1) { mixMs = 0; mix = 0; } }
      for (let j = 0, k = 0; j <= NY; j++) for (let i = 0; i <= NX; i++, k += 2) { warp(uv[k], uv[k + 1], P); pos[k] = out[0]; pos[k + 1] = out[1]; }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.t); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B.t); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ovTex);
      gl.uniform4fv(U('uRect'), rectFor()); gl.uniform1f(U('uMix'), mix); gl.uniform1f(U('uOv'), ovOn && !video ? 1 : 0); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    }
  };
}
