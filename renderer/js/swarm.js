// Swarm: visual particle system for task execution, progress rings, and screen highlighting
// Minimal, clean canvas-based overlays that don't obstruct

const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483646';
document.body.appendChild(cv);
const g = cv.getContext('2d', { desynchronized: true, alpha: true });

let W = 0, H = 0;
const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
fit();
addEventListener('resize', fit);

// --- Swarm Particle System ---
const PARTICLE_COUNT = 60;
const particles = new Float32Array(PARTICLE_COUNT * 8); // x, y, vx, vy, life, maxLife, size, hue
let particleTime = 0;
let activeSwarm = false;
let swarmCenter = { x: W/2, y: H/2 };
let swarmRadius = 0;
let swarmTargetRadius = 0;

function initParticles() {
  for (let i = 0; i < PARTICLE_COUNT; i++) resetParticle(i);
}

function resetParticle(i) {
  const o = i * 8;
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * 40;
  particles[o] = swarmCenter.x + Math.cos(angle) * r;
  particles[o + 1] = swarmCenter.y + Math.sin(angle) * r;
  particles[o + 2] = (Math.random() - 0.5) * 60;
  particles[o + 3] = (Math.random() - 0.5) * 60;
  particles[o + 4] = 0;
  particles[o + 5] = 1.5 + Math.random() * 2;
  particles[o + 6] = 2 + Math.random() * 3;
  particles[o + 7] = 330 + Math.random() * 40; // pink/purple hue range
}

function updateParticles(dt) {
  if (!activeSwarm) return;
  particleTime += dt;
  
  // Smooth radius transition
  swarmRadius += (swarmTargetRadius - swarmRadius) * dt * 3;
  
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * 8;
    particles[o + 4] += dt;
    
    if (particles[o + 4] >= particles[o + 5]) {
      // Respawn at center with new trajectory
      resetParticle(i);
      continue;
    }
    
    const lifeRatio = particles[o + 4] / particles[o + 5];
    
    // Orbital motion around center
    const angle = Math.atan2(particles[o + 1] - swarmCenter.y, particles[o] - swarmCenter.x);
    const dist = Math.hypot(particles[o] - swarmCenter.x, particles[o + 1] - swarmCenter.y);
    const targetDist = swarmRadius * (0.3 + 0.7 * lifeRatio);
    
    // Spring toward target orbit
    const springForce = (targetDist - dist) * 2;
    const orbitalSpeed = 1.5 / Math.max(1, dist / 50);
    
    particles[o + 2] += Math.cos(angle + Math.PI/2) * orbitalSpeed * 100 * dt - Math.cos(angle) * springForce * dt;
    particles[o + 3] += Math.sin(angle + Math.PI/2) * orbitalSpeed * 100 * dt - Math.sin(angle) * springForce * dt;
    
    // Damping
    particles[o + 2] *= 0.98;
    particles[o + 3] *= 0.98;
    
    particles[o] += particles[o + 2] * dt;
    particles[o + 1] += particles[o + 3] * dt;
  }
}

function drawParticles() {
  if (!activeSwarm) return;
  
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * 8;
    const lifeRatio = particles[o + 4] / particles[o + 5];
    const alpha = (1 - lifeRatio) * 0.6;
    const size = particles[o + 6] * (1 - lifeRatio * 0.5);
    
    g.globalAlpha = alpha;
    g.fillStyle = `hsl(${particles[o + 7]}, 80%, 65%)`;
    g.beginPath();
    g.arc(particles[o], particles[o + 1], size, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// --- Progress Rings ---
const progressRings = new Map(); // elementId -> { x, y, r, progress, label, startTime, duration }

function addProgressRing(id, x, y, radius, label, duration = 2000) {
  progressRings.set(id, {
    x, y, r: radius,
    progress: 0,
    label,
    startTime: performance.now(),
    duration
  });
}

function updateProgressRing(id, progress) {
  const ring = progressRings.get(id);
  if (ring) ring.progress = Math.max(0, Math.min(1, progress));
}

function removeProgressRing(id) {
  progressRings.delete(id);
}

function drawProgressRings() {
  const now = performance.now();
  for (const [id, ring] of progressRings) {
    const elapsed = (now - ring.startTime) / ring.duration;
    const autoProgress = ring.progress === 0 ? Math.min(1, elapsed) : ring.progress;
    
    const x = ring.x, y = ring.y, r = ring.r;
    const lineWidth = 3;
    
    // Background ring
    g.strokeStyle = 'rgba(255, 120, 170, 0.2)';
    g.lineWidth = lineWidth;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    
    // Progress ring
    const progress = autoProgress;
    const pulse = Math.sin(now / 200) * 0.05 + 1;
    g.strokeStyle = `rgba(255, 79, 148, ${0.8 * pulse})`;
    g.lineWidth = lineWidth;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(x, y, r, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * progress);
    g.stroke();
    
    // Center dot
    g.fillStyle = '#ff4f94';
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
    
    // Label
    if (ring.label) {
      g.font = '600 11px Segoe UI';
      g.fillStyle = '#ff4f94';
      g.textAlign = 'center';
      g.fillText(ring.label, x, y - r - 8);
    }
    
    // Auto-remove completed rings
    if (progress >= 1 && ring.progress > 0) {
      setTimeout(() => progressRings.delete(id), 500);
    }
  }
}

// --- Screen Region Highlights ---
const highlights = new Map(); // id -> { x, y, w, h, label, pulse, createdAt }

function addHighlight(id, rect, label = '') {
  highlights.set(id, {
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    label,
    pulse: 0,
    createdAt: performance.now()
  });
}

function removeHighlight(id) {
  highlights.delete(id);
}

function updateHighlight(id, rect, label) {
  const h = highlights.get(id);
  if (h) {
    h.x = rect.x; h.y = rect.y; h.w = rect.w; h.h = rect.h;
    if (label) h.label = label;
  }
}

function drawHighlights() {
  const now = performance.now();
  for (const [id, h] of highlights) {
    const age = now - h.createdAt;
    h.pulse = 1 + Math.sin(now / 160) * 0.04;
    const pad = 6;
    const x = h.x - pad, y = h.y - pad, w = h.w + pad * 2, ht = h.h + pad * 2;
    
    // Pulsing fill
    g.fillStyle = 'rgba(255, 120, 170, 0.14)';
    g.beginPath();
    g.roundRect(x - (h.pulse - 1) * w / 2, y - (h.pulse - 1) * ht / 2, w * h.pulse, ht * h.pulse, 10);
    g.fill();
    
    // Animated border
    g.strokeStyle = '#ff4f94';
    g.shadowColor = '#ff9bd0';
    g.shadowBlur = 18;
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(x, y, w, ht, 10);
    g.stroke();
    g.shadowBlur = 0;
    
    // Label
    if (h.label) {
      g.font = '700 13px Segoe UI';
      const tw = g.measureText(h.label.slice(0, 40)).width + 16;
      g.fillStyle = '#ff4f94';
      g.beginPath();
      g.roundRect(x, Math.max(2, y - 28), tw, 24, 12);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(h.label.slice(0, 40), x + 8, Math.max(2, y - 28) + 17);
    }
  }
}

// --- Task Step Indicators (for multi-step tasks) ---
const taskSteps = []; // { id, x, y, label, step, totalSteps, active }

function addTaskStep(id, x, y, label, totalSteps) {
  taskSteps.push({ id, x, y, label, step: 0, totalSteps, active: true, createdAt: performance.now() });
}

function updateTaskStep(id, step, label) {
  const ts = taskSteps.find(s => s.id === id);
  if (ts) { ts.step = step; if (label) ts.label = label; }
}

function completeTaskStep(id) {
  const idx = taskSteps.findIndex(s => s.id === id);
  if (idx >= 0) { taskSteps[idx].active = false; setTimeout(() => taskSteps.splice(idx, 1), 1000); }
}

function drawTaskSteps() {
  const now = performance.now();
  for (const ts of taskSteps) {
    const age = now - ts.createdAt;
    const pulse = 1 + Math.sin(now / 200) * 0.08;
    const spacing = 28;
    const totalW = (ts.totalSteps - 1) * spacing;
    const startX = ts.x - totalW / 2;
    
    for (let i = 0; i < ts.totalSteps; i++) {
      const sx = startX + i * spacing;
      const sy = ts.y;
      const isActive = i === ts.step;
      const isDone = i < ts.step;
      
      g.save();
      g.translate(sx, sy);
      g.scale(pulse, pulse);
      
      if (isDone) {
        g.fillStyle = '#8fd8ff';
        g.beginPath();
        g.arc(0, 0, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = '700 10px Segoe UI';
        g.textAlign = 'center';
        g.fillText('✓', 0, 3.5);
      } else if (isActive) {
        g.strokeStyle = '#ff4f94';
        g.shadowColor = '#ff9bd0';
        g.shadowBlur = 14;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 10, 0, Math.PI * 2);
        g.stroke();
        g.shadowBlur = 0;
        // Inner pulse
        g.fillStyle = 'rgba(255, 120, 170, 0.2)';
        g.beginPath();
        g.arc(0, 0, 6, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = 'rgba(255, 120, 170, 0.4)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, 8, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
    
    // Label
    if (ts.label) {
      g.font = '600 12px Segoe UI';
      g.fillStyle = '#ff4f94';
      g.textAlign = 'center';
      g.fillText(ts.label, ts.x, ts.y - 24);
    }
  }
}

// --- Main Animation Loop ---
let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  
  g.clearRect(0, 0, W, H);
  
  updateParticles(dt);
  drawParticles();
  drawHighlights();
  drawProgressRings();
  drawTaskSteps();
  
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// --- Public API ---
export const Swarm = {
  // Swarm particles
  startSwarm(centerX, centerY, radius = 80) {
    swarmCenter = { x: centerX, y: centerY };
    swarmRadius = 0;
    swarmTargetRadius = radius;
    activeSwarm = true;
    // Reinitialize particles at new center
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * 8;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 20;
      particles[o] = centerX + Math.cos(angle) * r;
      particles[o + 1] = centerY + Math.sin(angle) * r;
      particles[o + 4] = 0;
    }
  },
  
  stopSwarm() {
    activeSwarm = false;
    swarmTargetRadius = 0;
  },
  
  moveSwarm(centerX, centerY) {
    swarmCenter = { x: centerX, y: centerY };
  },
  
  setSwarmRadius(radius) {
    swarmTargetRadius = radius;
  },
  
  // Highlights
  highlight(id, rect, label) {
    addHighlight(id, rect, label);
  },
  
  unhighlight(id) {
    removeHighlight(id);
  },
  
  updateHighlight(id, rect, label) {
    updateHighlight(id, rect, label);
  },
  
  // Progress rings
  progressStart(id, x, y, radius, label, duration) {
    addProgressRing(id, x, y, radius, label, duration);
  },
  
  progressUpdate(id, progress) {
    updateProgressRing(id, progress);
  },
  
  progressEnd(id) {
    const ring = progressRings.get(id);
    if (ring) ring.progress = 1;
  },
  
  // Task steps (multi-step)
  taskStart(id, x, y, label, totalSteps) {
    addTaskStep(id, x, y, label, totalSteps);
  },
  
  taskStep(id, step, label) {
    updateTaskStep(id, step, label);
  },
  
  taskComplete(id) {
    completeTaskStep(id);
  },
  
  // Convenience: task types mapping to visual effects
  async runTask(type, target, options = {}) {
    const { rect, label, steps, duration = 2000 } = options;
    
    switch (type) {
      case 'click_ui':
      case 'type_into':
      case 'find_on_screen': {
        if (rect) {
          const cx = rect.x + rect.w / 2;
          const cy = rect.y + rect.h / 2;
          this.startSwarm(cx, cy, 60);
          this.highlight(`task-${type}`, rect, label || type);
          
          // Simulate progress
          for (let p = 0; p <= 1; p += 0.1) {
            this.progressUpdate(`task-${type}`, p);
            await new Promise(r => setTimeout(r, duration * 0.1));
          }
          
          setTimeout(() => {
            this.stopSwarm();
            this.unhighlight(`task-${type}`);
            this.progressEnd(`task-${type}`);
          }, 500);
        }
        break;
      }
      
      case 'describe_screen':
      case 'describe_window':
      case 'describe_here':
      case 'read_screen':
      case 'ask_screen': {
        // Full-screen swarm for vision tasks
        this.startSwarm(W/2, H/2, Math.max(W, H) * 0.4);
        await new Promise(r => setTimeout(r, duration));
        this.stopSwarm();
        break;
      }
      
      case 'web_search':
      case 'open_app':
      case 'open_url': {
        // Quick burst at center
        this.startSwarm(W/2, H/2, 50);
        await new Promise(r => setTimeout(r, 800));
        this.stopSwarm();
        break;
      }
      
      case 'multi_step': {
        if (steps && rect) {
          const cx = rect.x + rect.w / 2;
          const cy = rect.y - 40;
          this.taskStart(`task-${type}`, cx, cy, label || type, steps.length);
          
          for (let i = 0; i < steps.length; i++) {
            this.taskStep(`task-${type}`, i, steps[i]);
            await new Promise(r => setTimeout(r, duration / steps.length));
          }
          
          this.taskComplete(`task-${type}`);
        }
        break;
      }
    }
  }
};

// Global event bus for task events
const taskBus = new EventTarget();
export const onTask = (name, fn) => taskBus.addEventListener(name, e => fn(e.detail));
export const emitTask = (name, detail) => taskBus.dispatchEvent(new CustomEvent(name, { detail }));

// Auto-hook into router ACT functions when they're available
let actHooked = false;
function tryHookACT() {
  if (actHooked || !window.ACT) return;
  
  const originalACT = { ...window.ACT };
  for (const [name, fn] of Object.entries(window.ACT)) {
    if (typeof fn === 'function') {
      window.ACT[name] = async (args) => {
        emitTask('task:start', { name, args, time: performance.now() });
        try {
          const result = await fn(args);
          emitTask('task:end', { name, args, time: performance.now(), success: true });
          return result;
        } catch (e) {
          emitTask('task:end', { name, args, time: performance.now(), success: false, error: e.message });
          throw e;
        }
      };
    }
  }
  actHooked = true;
}

// Try hooking after a short delay (router loads after this module)
setTimeout(tryHookACT, 100);
setInterval(tryHookACT, 1000); // Keep trying

// Also expose globally for direct access
window.Swarm = Swarm;
window.onTask = onTask;
window.emitTask = emitTask;

console.log('[Swarm] Initialized - visual task overlay ready');
