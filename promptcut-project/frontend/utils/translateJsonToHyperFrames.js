/**
 * translateJsonToHyperFrames.js
 * ========================================================================
 * PromptCut Groq v2 (variant-aware)  ->  cinematic HyperFrames HTML.
 *
 * AESTHETICS-FIRST rewrite. The old translator had ONE fixed shape per type,
 * so every story rendered the same line / same ring / same centered text. This
 * version is a real motion-design engine:
 *
 *   • pulse_wave  -> 4 variants:  wave | bars | ecg | sonar
 *   • hud_ring    -> 4 variants:  rings | reticle | radar | gauge
 *   • kinetic_text-> 5 variants:  neon | glitch | stack | word-by-word-pop | typewriter
 *   • backgrounds -> 5 abstract generators: nebula | grid_floor | starfield | circuit | aurora
 *   • anchors     -> 10 placements so nothing is trapped dead-center
 *   • neon glow, gradient strokes, layered blooms, drifting abstract backdrops
 *
 * WHO DECIDES THE LOOK:
 *   Primary = the Groq LLM. It emits `variant`, `anchor`, `backgroundAsset.style`
 *   and rich per-type properties (see fastapi-backend/main.py). This lets a
 *   different STORY drive genuinely different geometry/positions/palettes.
 *   Fallback = a deterministic content seed (hash of scene text/ids). If the LLM
 *   omits a field, we still diversify per-scene instead of collapsing to one
 *   template — and it stays 100% deterministic (HyperFrames' capture engine
 *   seeks exact frame times, so NO Math.random / Date.now at RUNTIME).
 *
 *   The seeding math below runs at TRANSLATE time in Node and is baked into the
 *   emitted HTML as literals. The rendered page itself is fully static/seekable.
 *
 * HYPERFRAMES RULES HONORED (hyper-preview/CLAUDE.md):
 *   1. Every timed element: data-start / data-duration / data-track-index (SECONDS).
 *   2. Every timed element carries class="clip". Scenes: class="scene clip".
 *   3. ONE paused root timeline on window.__timelines[compositionId]; every tween
 *      is added to it at an absolute second offset (frame / fps).
 *   4. Deterministic only. All finite repeats. Valid JS identifiers.
 */

const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';

/* =============================== primitives =============================== */

function num(value, fallback) {
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : fallback;
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function round(v, d = 3) { const f = 10 ** d; return Math.round(v * f) / f; }
function framesToSeconds(frames, fps) { return round(num(frames, 0) / fps, 4); }

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsString(v) { return JSON.stringify(String(v == null ? '' : v)); }
function safeColor(v, fallback) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(v || '')) ? String(v) : fallback;
}

/* color math (compile-time) for gradients, tints, glows */
function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mixHex(a, b, t) {
  const c1 = hexToRgb(a), c2 = hexToRgb(b);
  const to = (x) => x.toString(16).padStart(2, '0');
  return `#${to(Math.round(c1.r + (c2.r - c1.r) * t))}${to(Math.round(c1.g + (c2.g - c1.g) * t))}${to(Math.round(c1.b + (c2.b - c1.b) * t))}`;
}

/* Layered neon bloom as a CSS drop-shadow stack. */
function neon(color, k = 1) {
  return (
    `drop-shadow(0 0 ${round(4 * k)}px ${color}) ` +
    `drop-shadow(0 0 ${round(10 * k)}px ${color}) ` +
    `drop-shadow(0 0 ${round(22 * k)}px ${rgba(color, 0.85)}) ` +
    `drop-shadow(0 0 ${round(44 * k)}px ${rgba(color, 0.5)})`
  );
}
function textNeon(color, accent) {
  return (
    `0 0 4px ${rgba('#ffffff', 0.9)}, 0 0 12px ${color}, 0 0 26px ${color}, ` +
    `0 0 52px ${accent}, 0 0 90px ${rgba(accent, 0.6)}`
  );
}

/* ============================ deterministic RNG =========================== */
/* FNV-1a hash + mulberry32. Compile-time only; output HTML is static. */

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeRng(seedStr) {
  let a = hashString(String(seedStr));
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
  };
}

/* =============================== id factory ============================== */

function createIdFactory() {
  let n = 0;
  return (p) => `${p}${n++}`;
}

/* =============================== anchoring =============================== */

const ANCHORS = ['center', 'left', 'right', 'top', 'bottom', 'tl', 'tr', 'bl', 'br', 'diag'];

/** Flex placement + padding for a full-bleed wrapper, so elements spread out. */
function anchorFlex(anchor) {
  switch (anchor) {
    case 'left': return 'justify-content:flex-start; align-items:center; padding:0 0 0 7%;';
    case 'right': return 'justify-content:flex-end; align-items:center; padding:0 7% 0 0;';
    case 'top': return 'justify-content:center; align-items:flex-start; padding:8% 0 0 0;';
    case 'bottom': return 'justify-content:center; align-items:flex-end; padding:0 0 9% 0;';
    case 'tl': return 'justify-content:flex-start; align-items:flex-start; padding:7% 0 0 7%;';
    case 'tr': return 'justify-content:flex-end; align-items:flex-start; padding:7% 7% 0 0;';
    case 'bl': return 'justify-content:flex-start; align-items:flex-end; padding:0 0 8% 7%;';
    case 'br': return 'justify-content:flex-end; align-items:flex-end; padding:0 7% 8% 0;';
    case 'diag':
    case 'center':
    default: return 'justify-content:center; align-items:center; padding:0 6%;';
  }
}

/** Resolve a motion graphic's anchor: LLM value, else seeded fallback. */
function resolveAnchor(mg, rng) {
  const a = String(mg?.properties?.anchor || mg?.anchor || '').toLowerCase();
  return ANCHORS.includes(a) ? a : rng.pick(ANCHORS);
}

/* ======================= shared timing / palette ======================== */

function timing(mg, fps) {
  const startSec = framesToSeconds(mg.startFrame ?? 0, fps);
  const endSec = framesToSeconds(mg.endFrame ?? 0, fps);
  const durSec = round(Math.max(1 / fps, endSec - startSec), 4);
  return { startSec, durSec };
}

/** Pull a color trio from properties, falling back to scene palette + seed. */
function palette(mg, ctx, rng) {
  const p = mg.properties || {};
  const base = ctx.scenePalette;
  const color = safeColor(p.color, rng.pick(base));
  let accent = safeColor(p.accentColor, base[(base.indexOf(color) + 1) % base.length] || base[0]);
  if (accent === color) accent = mixHex(color, '#ffffff', 0.4);
  const deep = mixHex(color, '#02040c', 0.72);
  return { color, accent, deep };
}

/* ================================ PULSE WAVE ============================= */

const PULSE_VARIANTS = ['wave', 'bars', 'ecg', 'sonar'];
function resolvePulseVariant(mg, rng) {
  const v = String(mg?.properties?.variant || mg?.variant || '').toLowerCase();
  return PULSE_VARIANTS.includes(v) ? v : rng.pick(PULSE_VARIANTS);
}

function renderPulseWave(mg, ctx) {
  const rng = makeRng(`${mg.id || 'pw'}|${mg?.properties?.text || ''}|pulse`);
  const variant = resolvePulseVariant(mg, rng);
  const { color, accent, deep } = palette(mg, ctx, rng);
  const { startSec, durSec } = timing(mg, ctx.fps);
  const anchor = resolveAnchor(mg, rng);
  const p = mg.properties || {};
  const meta = { color, accent, deep, startSec, durSec, anchor, rng, ctx, p, variant };
  if (variant === 'bars') return pulseBars(mg, meta);
  if (variant === 'ecg') return pulseEcg(mg, meta);
  if (variant === 'sonar') return pulseSonar(mg, meta);
  return pulseWaveLine(mg, meta);
}

function pulseFrame(mg, m, inner, extraJs = '') {
  const id = m.ctx.makeId('pw');
  const html = `
      <div id="${id}" class="mg pulse-wave clip" data-mg-variant="${m.variant || 'wave'}"
           data-start="${m.startSec}" data-duration="${m.durSec}" data-track-index="${m.ctx.nextTrack()}"
           style="position:absolute; inset:0; display:flex; ${anchorFlex(m.anchor)}">${inner}</div>`;
  const js = `
  // --- pulse_wave ${jsString(mg.id || id)} @${m.anchor} ---
  tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: ${round(Math.min(0.6, m.durSec), 3)}, ease: "power2.out" }, ${m.startSec});
${extraJs}`;
  return { html, js, id };
}

function pulseWaveLine(mg, m) {
  const { color, accent, ctx } = m;
  const amplitude = clamp(num(m.p.amplitude, 90), 40, 160);
  const frequency = clamp(num(m.p.frequency, 1.6), 0.8, 3);
  const thickness = clamp(num(m.p.thickness, 6), 3, 10);
  const W = Math.round(ctx.width * 0.82), H = Math.round(amplitude * 3.2);
  const mid = H / 2, step = 6, cycles = frequency * 2;
  const pts = [];
  for (let x = 0; x <= W; x += step) {
    const y = mid + Math.sin((x / W) * cycles * Math.PI * 2) * amplitude
      + Math.sin((x / W) * cycles * Math.PI * 5) * (amplitude * 0.22);
    pts.push(`${round(x, 1)},${round(y, 1)}`);
  }
  const d = `M ${pts.join(' L ')}`;
  const gid = ctx.makeId('grad');
  const glowId = ctx.makeId('pwglow');
  const pathId = ctx.makeId('pwpath');
  const inner = `
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible;">
          <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="${accent}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${accent}"/>
          </linearGradient></defs>
          <path d="${d}" fill="none" stroke="${rgba(color, 0.25)}" stroke-width="${thickness * 3}" stroke-linecap="round" style="filter:blur(8px);"/>
          <path id="${pathId}" d="${d}" fill="none" stroke="url(#${gid})" stroke-width="${thickness}" stroke-linecap="round" style="filter:${neon(color, 1)};"/>
          <circle id="${glowId}" r="${thickness * 2.2}" cx="0" cy="${round(mid, 1)}" fill="#fff" style="filter:${neon(accent, 1.4)};"/>
        </svg>`;
  const passes = clamp(Math.round(num(m.p.speed, 2)), 1, 4);
  const len = pts.length * step;
  const extra = `
  { const path = document.getElementById(${jsString(pathId)}); const len = ${round(len, 1)};
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    tl.fromTo(path, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: ${round(Math.min(m.durSec, 1.4), 3)}, ease: "power2.out" }, ${m.startSec}); }
  tl.fromTo("#${glowId}", { attr: { cx: 0 } }, { attr: { cx: ${W} }, duration: ${round(m.durSec / passes, 3)}, ease: "sine.inOut", repeat: ${passes - 1}, yoyo: true }, ${m.startSec});`;
  return pulseFrame(mg, m, inner, extra);
}

function pulseBars(mg, m) {
  const { color, accent, ctx, rng } = m;
  const count = clamp(num(m.p.bars, rng.int(28, 52)), 12, 72);
  const gap = 6, barW = clamp(Math.round((ctx.width * 0.7) / count) - gap, 6, 40);
  const maxH = clamp(num(m.p.amplitude, 220), 120, 340);
  const bars = [];
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const h0 = round(rng.range(0.15, 0.55) * maxH, 1);
    const h1 = round(rng.range(0.6, 1) * maxH, 1);
    const c = mixHex(color, accent, i / count);
    const id = ctx.makeId('bar');
    seeds.push({ id, h1 });
    bars.push(`<div id="${id}" style="width:${barW}px; height:${h0}px; border-radius:${barW}px; background:linear-gradient(${accent},${c}); filter:${neon(c, 0.7)}; transform-origin:50% 100%;"></div>`);
  }
  const inner = `<div style="display:flex; align-items:flex-end; gap:${gap}px; height:${maxH}px;">${bars.join('')}</div>`;
  const cycles = clamp(Math.round(m.durSec / 0.9), 1, 12);
  const tweens = seeds.map((s, i) =>
    `  tl.to("#${s.id}", { height: ${s.h1}, duration: ${round(rng.range(0.35, 0.7), 3)}, ease: "sine.inOut", repeat: ${cycles * 2 - 1}, yoyo: true }, ${round(m.startSec + i * 0.02, 3)});`,
  ).join('\n');
  return pulseFrame(mg, { ...m }, inner, tweens);
}

function pulseEcg(mg, m) {
  const { color, accent, ctx } = m;
  const W = Math.round(ctx.width * 0.8), H = 300, mid = H / 2;
  const beats = clamp(num(m.p.frequency, 4), 2, 8);
  const seg = W / beats;
  let d = `M 0 ${mid}`;
  for (let b = 0; b < beats; b++) {
    const x = b * seg;
    d += ` L ${round(x + seg * 0.35, 1)} ${mid} L ${round(x + seg * 0.42, 1)} ${mid - 20}`;
    d += ` L ${round(x + seg * 0.48, 1)} ${mid + 12} L ${round(x + seg * 0.52, 1)} ${round(mid - 130, 1)}`;
    d += ` L ${round(x + seg * 0.56, 1)} ${round(mid + 60, 1)} L ${round(x + seg * 0.62, 1)} ${mid} L ${round(x + seg, 1)} ${mid}`;
  }
  const pathId = ctx.makeId('ecg');
  const dotId = ctx.makeId('ecgdot');
  const inner = `
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible;">
          <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="${rgba(accent, 0.25)}" stroke-width="1"/>
          <path id="${pathId}" d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" style="filter:${neon(color, 1.1)};"/>
          <circle id="${dotId}" r="8" cx="0" cy="${mid}" fill="#fff" style="filter:${neon(accent, 1.4)};"/>
        </svg>`;
  const passes = clamp(Math.round(num(m.p.speed, 2)), 1, 4);
  const extra = `
  { const path = document.getElementById(${jsString(pathId)}); const L = path.getTotalLength ? path.getTotalLength() : ${W};
    gsap.set(path, { strokeDasharray: L, strokeDashoffset: L });
    tl.fromTo(path, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: ${round(m.durSec * 0.8, 3)}, ease: "none" }, ${m.startSec}); }
  tl.fromTo("#${dotId}", { attr: { cx: 0 } }, { attr: { cx: ${W} }, duration: ${round(m.durSec / passes, 3)}, ease: "none", repeat: ${passes - 1} }, ${m.startSec});`;
  return pulseFrame(mg, m, inner, extra);
}

function pulseSonar(mg, m) {
  const { color, accent, ctx } = m;
  const rings = clamp(num(m.p.rings, 4), 2, 6);
  const R = clamp(num(m.p.radius, 260), 160, 340);
  const ids = [];
  const circles = [];
  for (let i = 0; i < rings; i++) {
    const id = ctx.makeId('son');
    ids.push(id);
    const c = mixHex(color, accent, i / rings);
    circles.push(`<div id="${id}" style="position:absolute; left:50%; top:50%; width:${R * 2}px; height:${R * 2}px; margin:${-R}px 0 0 ${-R}px; border-radius:50%; border:2px solid ${c}; box-shadow:0 0 30px ${c};"></div>`);
  }
  const coreId = ctx.makeId('soncore');
  const inner = `<div style="position:relative; width:${R * 2}px; height:${R * 2}px;">
        ${circles.join('')}
        <div id="${coreId}" style="position:absolute; left:50%; top:50%; width:24px; height:24px; margin:-12px 0 0 -12px; border-radius:50%; background:#fff; filter:${neon(accent, 1.4)};"></div>
      </div>`;
  const pulseDur = clamp(m.durSec / rings, 0.8, 2.4);
  const reps = clamp(Math.round(m.durSec / pulseDur), 1, 10);
  const tweens = ids.map((id, i) =>
    `  tl.fromTo("#${id}", { scale: 0.05, opacity: 0.95 }, { scale: 1, opacity: 0, duration: ${round(pulseDur, 3)}, ease: "power1.out", repeat: ${reps - 1} }, ${round(m.startSec + i * (pulseDur / rings), 3)});`,
  ).join('\n');
  const core = `  tl.fromTo("#${coreId}", { scale: 0.6 }, { scale: 1.25, duration: 0.5, ease: "sine.inOut", repeat: ${clamp(Math.round(m.durSec / 0.5), 1, 20) - 1}, yoyo: true }, ${m.startSec});`;
  return pulseFrame(mg, m, inner, `${tweens}\n${core}`);
}

/* ================================= HUD RING ============================= */

const HUD_VARIANTS = ['rings', 'reticle', 'radar', 'gauge'];
function resolveHudVariant(mg, rng) {
  const v = String(mg?.properties?.variant || mg?.variant || '').toLowerCase();
  return HUD_VARIANTS.includes(v) ? v : rng.pick(HUD_VARIANTS);
}

function renderHudRing(mg, ctx) {
  const rng = makeRng(`${mg.id || 'hr'}|${mg?.properties?.text || ''}|hud`);
  const variant = resolveHudVariant(mg, rng);
  const { color, accent } = palette(mg, ctx, rng);
  const { startSec, durSec } = timing(mg, ctx.fps);
  const anchor = resolveAnchor(mg, rng);
  const p = mg.properties || {};
  const rotationSpeed = clamp(num(p.rotationSpeed, 1), 0.4, 2.5);
  const R = clamp(num(p.radius, 300), 160, 360);
  const m = { color, accent, startSec, durSec, anchor, R, rotationSpeed, ctx, rng, p };
  if (variant === 'reticle') return hudReticle(mg, m);
  if (variant === 'radar') return hudRadar(mg, m);
  if (variant === 'gauge') return hudGauge(mg, m);
  return hudRings(mg, m);
}

function hudFrame(mg, m, variant, inner, extraJs) {
  const id = m.ctx.makeId('hud');
  const html = `
      <div id="${id}" class="mg hud-ring clip" data-mg-variant="${variant}"
           data-start="${m.startSec}" data-duration="${m.durSec}" data-track-index="${m.ctx.nextTrack()}"
           style="position:absolute; inset:0; display:flex; ${anchorFlex(m.anchor)}">${inner}</div>`;
  const js = `
  // --- hud_ring:${variant} ${jsString(mg.id || id)} @${m.anchor} ---
  tl.fromTo("#${id}", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: ${round(Math.min(0.7, m.durSec), 3)}, ease: "back.out(1.6)" }, ${m.startSec});
${extraJs}`;
  return { html, js, id };
}

function hudRings(mg, m) {
  const { color, accent, R, ctx } = m;
  const size = R * 2;
  const ticks = [];
  const tickCount = 60;
  for (let i = 0; i < tickCount; i++) {
    const long = i % 5 === 0;
    ticks.push(`<div style="position:absolute; left:50%; top:0; width:${long ? 3 : 1}px; height:${long ? 24 : 12}px; background:${long ? accent : color}; transform-origin:50% ${R}px; transform:translateX(-50%) rotate(${round((i / tickCount) * 360, 2)}deg);"></div>`);
  }
  const ticksId = ctx.makeId('ticks'), midId = ctx.makeId('mid'), coreId = ctx.makeId('core');
  const inner = `<div style="position:relative; width:${size}px; height:${size}px;">
        <div style="position:absolute; inset:0; border-radius:50%; border:2px solid ${color}; box-shadow:0 0 40px ${rgba(color, 0.6)}, inset 0 0 40px ${rgba(color, 0.35)};"></div>
        <div id="${midId}" style="position:absolute; inset:${round(R * 0.2, 1)}px; border-radius:50%; border:1px dashed ${accent};"></div>
        <div id="${ticksId}" style="position:absolute; inset:0;">${ticks.join('')}</div>
        <div style="position:absolute; inset:${round(R * 0.42, 1)}px; border-radius:50%; border:1px solid ${rgba(color, 0.4)};"></div>
        <div id="${coreId}" style="position:absolute; left:50%; top:50%; width:${round(R * 0.36, 1)}px; height:${round(R * 0.36, 1)}px; margin:${round(-R * 0.18, 1)}px 0 0 ${round(-R * 0.18, 1)}px; border-radius:50%; background:radial-gradient(circle, ${rgba(accent, 0.5)}, transparent 70%);"></div>
      </div>`;
  const spin = round(360 * m.rotationSpeed * (m.durSec / 4), 1);
  const extra = `  tl.to("#${ticksId}", { rotation: ${spin}, duration: ${m.durSec}, ease: "none", transformOrigin: "50% 50%" }, ${m.startSec});
  tl.to("#${midId}", { rotation: ${round(-spin * 0.6, 1)}, duration: ${m.durSec}, ease: "none", transformOrigin: "50% 50%" }, ${m.startSec});
  tl.fromTo("#${coreId}", { opacity: 0.4 }, { opacity: 1, duration: 0.8, ease: "sine.inOut", repeat: ${clamp(Math.round(m.durSec / 0.8), 1, 20) - 1}, yoyo: true }, ${m.startSec});`;
  return hudFrame(mg, m, 'rings', inner, extra);
}

function hudReticle(mg, m) {
  const { color, accent, R, ctx } = m;
  const size = R * 2;
  const bracket = (rot) => `<div style="position:absolute; width:${round(R * 0.5, 1)}px; height:${round(R * 0.5, 1)}px; border-left:3px solid ${accent}; border-top:3px solid ${accent}; filter:${neon(accent, 0.7)}; transform:rotate(${rot}deg); transform-origin:center;"></div>`;
  const arcId = ctx.makeId('arc'), crossId = ctx.makeId('cross'), dotId = ctx.makeId('rdot');
  const inner = `<div style="position:relative; width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; top:0; left:0;">${bracket(0)}</div>
        <div style="position:absolute; top:0; right:0;">${bracket(90)}</div>
        <div style="position:absolute; bottom:0; right:0;">${bracket(180)}</div>
        <div style="position:absolute; bottom:0; left:0;">${bracket(270)}</div>
        <div id="${arcId}" style="position:absolute; inset:${round(R * 0.25, 1)}px; border-radius:50%; border:2px dashed ${color}; border-right-color:transparent; border-bottom-color:transparent; filter:${neon(color, 0.6)};"></div>
        <div style="position:absolute; inset:${round(R * 0.42, 1)}px; border-radius:50%; border:1px solid ${rgba(color, 0.5)};"></div>
        <div id="${crossId}" style="position:absolute; width:${size}px; height:1px; background:linear-gradient(90deg, transparent, ${rgba(accent, 0.7)}, transparent);"></div>
        <div style="position:absolute; height:${size}px; width:1px; background:linear-gradient(${rgba(accent, 0.7)}, transparent, ${rgba(accent, 0.7)});"></div>
        <div id="${dotId}" style="position:absolute; width:14px; height:14px; border-radius:50%; background:#fff; filter:${neon(accent, 1.3)};"></div>
      </div>`;
  const spin = round(360 * m.rotationSpeed * (m.durSec / 5), 1);
  const extra = `  tl.to("#${arcId}", { rotation: ${spin}, duration: ${m.durSec}, ease: "none", transformOrigin: "50% 50%" }, ${m.startSec});
  tl.fromTo("#${crossId}", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out" }, ${m.startSec});
  tl.fromTo("#${dotId}", { scale: 0.5, opacity: 0.5 }, { scale: 1.3, opacity: 1, duration: 0.6, ease: "sine.inOut", repeat: ${clamp(Math.round(m.durSec / 0.6), 1, 30) - 1}, yoyo: true }, ${m.startSec});`;
  return hudFrame(mg, m, 'reticle', inner, extra);
}

function hudRadar(mg, m) {
  const { color, accent, R, ctx } = m;
  const size = R * 2;
  const grid = [];
  for (let i = 1; i <= 3; i++) grid.push(`<div style="position:absolute; inset:${round(R * (1 - i / 3), 1)}px; border-radius:50%; border:1px solid ${rgba(color, 0.3)};"></div>`);
  const blips = [];
  for (let i = 0; i < m.rng.int(3, 6); i++) {
    const ang = m.rng.range(0, Math.PI * 2), rad = m.rng.range(0.2, 0.9) * R;
    const bx = Math.cos(ang) * rad, by = Math.sin(ang) * rad;
    const id = ctx.makeId('blip');
    blips.push({ id, html: `<div id="${id}" style="position:absolute; left:50%; top:50%; width:12px; height:12px; margin:-6px 0 0 -6px; border-radius:50%; background:${accent}; filter:${neon(accent, 1)}; transform:translate(${round(bx, 1)}px, ${round(by, 1)}px); opacity:0;"></div>` });
  }
  const sweepId = ctx.makeId('sweep');
  const inner = `<div style="position:relative; width:${size}px; height:${size}px; border-radius:50%; border:2px solid ${color}; box-shadow:0 0 40px ${rgba(color, 0.5)}, inset 0 0 30px ${rgba(color, 0.25)}; overflow:hidden;">
        ${grid.join('')}
        <div style="position:absolute; left:50%; top:0; bottom:0; width:1px; background:${rgba(color, 0.35)};"></div>
        <div style="position:absolute; top:50%; left:0; right:0; height:1px; background:${rgba(color, 0.35)};"></div>
        <div id="${sweepId}" style="position:absolute; inset:0; border-radius:50%; background:conic-gradient(from 0deg, ${rgba(accent, 0.55)}, transparent 55%); transform-origin:50% 50%;"></div>
        ${blips.map((b) => b.html).join('')}
      </div>`;
  const sweeps = clamp(Math.round(m.durSec / (2 / m.rotationSpeed)), 1, 12);
  let extra = `  tl.to("#${sweepId}", { rotation: 360, duration: ${round(m.durSec / sweeps, 3)}, ease: "none", repeat: ${sweeps - 1}, transformOrigin: "50% 50%" }, ${m.startSec});\n`;
  extra += blips.map((b, i) =>
    `  tl.fromTo("#${b.id}", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out", repeat: ${sweeps - 1}, repeatDelay: ${round(m.durSec / sweeps - 0.25, 3)} }, ${round(m.startSec + m.rng.range(0, m.durSec / sweeps), 3)});`,
  ).join('\n');
  return hudFrame(mg, m, 'radar', inner, extra);
}

function hudGauge(mg, m) {
  const { color, accent, R, ctx } = m;
  const size = R * 2;
  const cx = R, cy = R, rad = R - 12;
  const segs = 40;
  const arcs = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (-220 + (i / segs) * 260) * (Math.PI / 180);
    const a1 = (-220 + ((i + 0.6) / segs) * 260) * (Math.PI / 180);
    const x0 = round(cx + Math.cos(a0) * rad, 1), y0 = round(cy + Math.sin(a0) * rad, 1);
    const x1 = round(cx + Math.cos(a1) * rad, 1), y1 = round(cy + Math.sin(a1) * rad, 1);
    const c = mixHex(color, accent, i / segs);
    arcs.push(`<path d="M ${x0} ${y0} A ${rad} ${rad} 0 0 1 ${x1} ${y1}" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>`);
  }
  const needleId = ctx.makeId('needle');
  const valId = ctx.makeId('gval');
  const target = clamp(num(m.p.value, m.rng.int(60, 98)), 0, 100);
  const inner = `<div style="position:relative; width:${size}px; height:${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="filter:${neon(color, 0.7)};">${arcs.join('')}</svg>
        <div id="${needleId}" style="position:absolute; left:${cx}px; top:${cy}px; width:${round(rad * 0.9, 1)}px; height:3px; background:linear-gradient(90deg, transparent, ${accent}); transform-origin:0 50%; transform:rotate(-220deg); filter:${neon(accent, 1)};"></div>
        <div style="position:absolute; left:50%; top:50%; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%; background:${accent}; filter:${neon(accent, 1.2)};"></div>
        <div id="${valId}" style="position:absolute; left:0; right:0; bottom:${round(R * 0.22, 1)}px; text-align:center; font-family:'JetBrains Mono',monospace; font-size:${round(R * 0.28, 1)}px; font-weight:800; color:#fff; text-shadow:${textNeon(color, accent)};">0</div>
      </div>`;
  const needleDeg = round(-220 + (target / 100) * 260, 1);
  const extra = `  tl.fromTo("#${needleId}", { rotation: -220 }, { rotation: ${needleDeg}, duration: ${round(Math.min(m.durSec * 0.7, 1.6), 3)}, ease: "power3.out", transformOrigin: "0% 50%" }, ${m.startSec});
  { const el = document.getElementById(${jsString(valId)}); const prox = { v: 0 };
    tl.to(prox, { v: ${target}, duration: ${round(Math.min(m.durSec * 0.7, 1.6), 3)}, ease: "power3.out", onUpdate: () => { el.textContent = Math.round(prox.v); } }, ${m.startSec}); }`;
  return hudFrame(mg, m, 'gauge', inner, extra);
}

/* =============================== KINETIC TEXT =========================== */

const TEXT_VARIANTS = ['neon', 'glitch', 'stack', 'word-by-word-pop', 'typewriter'];
function resolveTextVariant(mg, rng) {
  const raw = String(mg?.properties?.animationStyle || mg?.properties?.variant || mg?.variant || '').toLowerCase();
  if (raw === 'fade-in-words') return 'word-by-word-pop';
  return TEXT_VARIANTS.includes(raw) ? raw : rng.pick(TEXT_VARIANTS);
}

function renderKineticText(mg, ctx) {
  const p = mg.properties || {};
  const rng = makeRng(`${mg.id || 'kt'}|${p.text || ''}|text`);
  const variant = resolveTextVariant(mg, rng);
  const { color, accent } = palette(mg, ctx, rng);
  const { startSec, durSec } = timing(mg, ctx.fps);
  const anchor = resolveAnchor(mg, rng);
  const text = String(p.text || '').trim();
  const fontSize = clamp(num(p.fontSize, 78), 40, 120);
  const highlight = new Set((Array.isArray(p.highlightWords) ? p.highlightWords : []).map((w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  const m = { color, accent, startSec, durSec, anchor, text, fontSize, highlight, ctx, rng, fps: ctx.fps };
  if (variant === 'glitch') return textGlitch(mg, m);
  if (variant === 'stack') return textStack(mg, m);
  if (variant === 'typewriter') return textTypewriter(mg, m);
  if (variant === 'neon') return textNeonBanner(mg, m);
  return textWordPop(mg, m);
}

function textWrap(mg, m, variant, innerHtml, styleExtra = '') {
  const id = m.ctx.makeId('kt');
  const html = `
      <div id="${id}" class="mg kinetic-text clip" data-mg-variant="${variant}"
           data-start="${m.startSec}" data-duration="${m.durSec}" data-track-index="${m.ctx.nextTrack()}"
           style="position:absolute; inset:0; display:flex; ${anchorFlex(m.anchor)} font-weight:900; line-height:1.05; ${styleExtra}">${innerHtml}</div>`;
  return { html, id };
}

function textNeonBanner(mg, m) {
  const { text, color, accent, fontSize } = m;
  const grad = `linear-gradient(92deg, ${color}, ${mixHex(color, '#ffffff', 0.5)} 45%, ${accent})`;
  const { html, id } = textWrap(mg, m, 'neon',
    `<div style="text-align:center; text-transform:uppercase; letter-spacing:0.04em; font-size:${fontSize}px;
        background:${grad}; -webkit-background-clip:text; background-clip:text; color:transparent;
        filter:${neon(color, 0.5)}; text-shadow:${textNeon(color, accent)};">${escapeHtml(text)}</div>`);
  const js = `
  // --- kinetic_text:neon ${jsString(mg.id || id)} @${m.anchor} ---
  tl.fromTo("#${id} > div", { opacity: 0, scale: 1.25, filter: "blur(14px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: ${round(Math.min(0.9, m.durSec), 3)}, ease: "power3.out" }, ${m.startSec});
  tl.to("#${id} > div", { letterSpacing: "0.10em", duration: ${round(m.durSec, 3)}, ease: "sine.inOut" }, ${m.startSec});`;
  return { html, js };
}

function textGlitch(mg, m) {
  const { text, color, accent, fontSize, ctx } = m;
  const rId = ctx.makeId('gr'), cId = ctx.makeId('gc'), mId = ctx.makeId('gm');
  const typo = `text-transform:uppercase; letter-spacing:0.02em; font-size:${fontSize}px; text-align:center; white-space:nowrap;`;
  const overlay = `position:absolute; inset:0; ${typo} mix-blend-mode:screen;`;
  const { html, id } = textWrap(mg, m, 'glitch',
    // Main layer is IN-FLOW so the container sizes to the text; RGB-split copies
    // overlay it via inset:0 (no zero-width collapse -> no edge clipping).
    `<div style="position:relative; display:inline-block;">
        <div id="${mId}" style="position:relative; ${typo} color:#fff; text-shadow:${textNeon(color, accent)};">${escapeHtml(text)}</div>
        <div id="${rId}" aria-hidden="true" style="${overlay} color:${rgba('#ff2d75', 0.9)};">${escapeHtml(text)}</div>
        <div id="${cId}" aria-hidden="true" style="${overlay} color:${rgba('#00e5ff', 0.9)};">${escapeHtml(text)}</div>
      </div>`);
  const jitters = clamp(Math.round(m.durSec / 0.4), 2, 20);
  const js = `
  // --- kinetic_text:glitch ${jsString(mg.id || id)} @${m.anchor} ---
  tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${m.startSec});
  tl.fromTo("#${mId}", { scale: 1.2, filter: "blur(10px)" }, { scale: 1, filter: "blur(0px)", duration: 0.6, ease: "power3.out" }, ${m.startSec});
  tl.to("#${rId}", { x: -8, y: 3, duration: 0.08, ease: "steps(2)", repeat: ${jitters * 2 - 1}, yoyo: true }, ${m.startSec});
  tl.to("#${cId}", { x: 8, y: -3, duration: 0.08, ease: "steps(2)", repeat: ${jitters * 2 - 1}, yoyo: true }, ${m.startSec});`;
  return { html, js };
}

function textStack(mg, m) {
  const { text, color, accent, fontSize, highlight, rng } = m;
  const words = text.length ? text.split(/\s+/) : [];
  const lines = words.map((w, i) => {
    const norm = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const hot = highlight.has(norm);
    const c = hot ? accent : '#ffffff';
    const rot = round(rng.range(-4, 4), 2);
    const off = round(rng.range(-6, 10), 1);
    const scale = hot ? 1.15 : 1;
    return `<div data-line="${i}" style="display:block; transform-origin:left center; margin-left:${off}%; transform:rotate(${rot}deg) scale(${scale}); font-size:${round(fontSize * (hot ? 1.1 : 0.92), 1)}px; text-transform:uppercase; color:${c}; text-shadow:${hot ? textNeon(color, accent) : '0 4px 24px rgba(0,0,0,0.6)'};">${escapeHtml(w)}</div>`;
  }).join('');
  const { html, id } = textWrap(mg, m, 'stack',
    `<div style="display:flex; flex-direction:column; gap:0.02em; letter-spacing:-0.01em;">${lines}</div>`,
    'font-style:italic;');
  const stagger = clamp((m.durSec - 0.5) / Math.max(1, words.length), 0.05, 0.22);
  const js = `
  // --- kinetic_text:stack ${jsString(mg.id || id)} @${m.anchor} ---
  tl.fromTo("#${id} [data-line]", { opacity: 0, x: -120, skewX: 12 }, { opacity: 1, x: 0, skewX: 0, duration: ${round(Math.min(0.6, m.durSec), 3)}, ease: "power4.out", stagger: ${round(stagger, 3)} }, ${m.startSec});`;
  return { html, js };
}

function textWordPop(mg, m) {
  const { text, color, accent, fontSize, highlight, fps } = m;
  const words = text.length ? text.split(/\s+/) : [];
  const spans = words.map((w, i) => {
    const norm = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const c = highlight.has(norm) ? accent : color;
    const glow = highlight.has(norm) ? `text-shadow:${textNeon(color, accent)};` : '';
    return `<span data-w="${i}" style="display:inline-block; margin:0 0.16em; color:${c}; ${glow}">${escapeHtml(w)}</span>`;
  }).join('');
  const { html, id } = textWrap(mg, m, 'word-by-word-pop',
    `<div style="text-align:center; font-size:${fontSize}px; text-transform:uppercase;"><span style="display:inline-flex; flex-wrap:wrap; justify-content:center;">${spans}</span></div>`);
  const beatSec = round(3 / fps, 4);
  const maxStagger = round(Math.max(0, m.durSec - 0.4) / Math.max(1, words.length), 4);
  const stagger = Math.min(beatSec, maxStagger || beatSec);
  const js = `
  // --- kinetic_text:word-by-word-pop ${jsString(mg.id || id)} @${m.anchor} ---
  tl.fromTo("#${id} [data-w]", { opacity: 0, scale: 0.4, y: 30, filter: "blur(6px)" }, { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", duration: ${round(Math.min(0.45, m.durSec), 3)}, ease: "back.out(2.2)", stagger: ${stagger} }, ${m.startSec});`;
  return { html, js };
}

function textTypewriter(mg, m) {
  const { text, color, accent, fontSize, ctx, fps, durSec, startSec } = m;
  const targetId = ctx.makeId('tw');
  const { html, id } = textWrap(mg, m, 'typewriter',
    `<div style="font-family:'JetBrains Mono',monospace; font-size:${round(fontSize * 0.8, 1)}px; letter-spacing:0.02em; color:${color}; text-shadow:${textNeon(color, accent)}; text-align:left; max-width:80%;">
        <span style="color:${accent};">&gt;_ </span><span id="${targetId}"></span><span data-caret style="color:${accent};">▍</span></div>`);
  const revealSec = round(clamp(text.length / (1.5 * fps), 0.1, Math.max(0.1, durSec - 0.2)), 4);
  const caretCycles = Math.max(1, Math.floor(durSec / 1));
  const js = `
  // --- kinetic_text:typewriter ${jsString(mg.id || id)} @${m.anchor} ---
  { const full = ${jsString(text)}; const el = document.getElementById(${jsString(targetId)}); const prox = { n: 0 };
    tl.set(el, { textContent: "" }, ${startSec});
    tl.to(prox, { n: full.length, duration: ${revealSec}, ease: "none", onUpdate: () => { el.textContent = full.slice(0, Math.floor(prox.n)); } }, ${startSec});
    tl.to("#${id} [data-caret]", { opacity: 0.15, duration: 0.5, ease: "steps(1)", repeat: ${caretCycles - 1}, yoyo: true }, ${startSec}); }`;
  return { html, js };
}

/* ============================ ABSTRACT BACKGROUNDS ====================== */

const BG_STYLES = ['nebula', 'grid_floor', 'starfield', 'circuit', 'aurora'];
function resolveBgStyle(scene, rng) {
  const bg = scene.backgroundAsset || {};
  const s = String(bg.style || '').toLowerCase();
  if (BG_STYLES.includes(s)) return s;
  // Back-compat with the old "type" field, else seeded pick.
  if (bg.type === 'grid_overlay') return 'circuit';
  if (bg.type === 'gradient_mesh') return rng.bool(0.5) ? 'nebula' : 'aurora';
  return rng.pick(BG_STYLES);
}

function renderBackground(scene, sceneStartSec, sceneDurSec, ctx, rng, palette2) {
  const style = resolveBgStyle(scene, rng);
  const [c0, c1] = palette2;
  const W = ctx.width, H = ctx.height;
  const layers = [];
  const scripts = [];
  const push = (html, js) => { layers.push(html); if (js) scripts.push(js); };

  // deep base wash common to all
  push(`<div style="position:absolute; inset:0; background:radial-gradient(circle at 50% 40%, ${mixHex(c0, '#02040c', 0.55)}, #01020a 75%);"></div>`);

  if (style === 'nebula') {
    for (let i = 0; i < 5; i++) {
      const bx = round(rng.range(5, 85), 1), by = round(rng.range(5, 80), 1);
      const sz = round(rng.range(35, 70), 1);
      const c = mixHex(rng.bool() ? c0 : c1, '#ffffff', rng.range(0, 0.25));
      const id = ctx.makeId('blob');
      push(`<div id="${id}" style="position:absolute; left:${bx}%; top:${by}%; width:${sz}vw; height:${sz}vw; margin:-${sz / 2}vw 0 0 -${sz / 2}vw; border-radius:50%; background:radial-gradient(circle, ${rgba(c, 0.55)}, transparent 68%); filter:blur(20px);"></div>`,
        `  tl.to("#${id}", { x: ${round(rng.range(-140, 140), 1)}, y: ${round(rng.range(-90, 90), 1)}, duration: ${sceneDurSec}, ease: "sine.inOut" }, ${sceneStartSec});`);
    }
    const conicId = ctx.makeId('conic');
    push(`<div id="${conicId}" style="position:absolute; inset:-20%; background:conic-gradient(from 0deg, transparent, ${rgba(c1, 0.12)}, transparent 40%, ${rgba(c0, 0.12)}, transparent 70%); mix-blend-mode:screen;"></div>`,
      `  tl.to("#${conicId}", { rotation: 360, duration: ${sceneDurSec}, ease: "none", transformOrigin: "50% 50%" }, ${sceneStartSec});`);
  } else if (style === 'grid_floor') {
    const floorId = ctx.makeId('floor');
    push(`<div style="position:absolute; left:0; right:0; top:0; height:52%; background:radial-gradient(ellipse at 50% 100%, ${rgba(c1, 0.35)}, transparent 70%);"></div>`);
    push(`<div style="position:absolute; left:0; right:0; bottom:48%; height:2px; background:${c1}; box-shadow:0 0 30px ${c1};"></div>`);
    push(`<div id="${floorId}" style="position:absolute; left:-50%; right:-50%; bottom:0; height:48%; background-image:linear-gradient(${rgba(c0, 0.5)} 2px, transparent 2px), linear-gradient(90deg, ${rgba(c0, 0.5)} 2px, transparent 2px); background-size:80px 80px; transform:perspective(420px) rotateX(66deg); transform-origin:50% 100%;"></div>`,
      `  tl.fromTo("#${floorId}", { backgroundPositionY: "0px" }, { backgroundPositionY: "80px", duration: ${round(sceneDurSec / Math.max(1, Math.round(sceneDurSec / 1.4)), 3)}, ease: "none", repeat: ${Math.max(1, Math.round(sceneDurSec / 1.4)) - 1} }, ${sceneStartSec});`);
  } else if (style === 'starfield') {
    const stars = [];
    for (let i = 0; i < 90; i++) {
      const sx = round(rng.range(0, 100), 2), sy = round(rng.range(0, 100), 2);
      const r = round(rng.range(0.5, 2.4), 1);
      const c = rng.bool(0.3) ? c1 : '#ffffff';
      stars.push(`<circle cx="${sx}%" cy="${sy}%" r="${r}" fill="${c}" opacity="${round(rng.range(0.3, 1), 2)}"/>`);
    }
    const fieldId = ctx.makeId('stars');
    push(`<svg id="${fieldId}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute; inset:0;">${stars.join('')}</svg>`,
      `  tl.fromTo("#${fieldId}", { scale: 1, opacity: 0.6 }, { scale: 1.12, opacity: 1, duration: ${sceneDurSec}, ease: "sine.inOut", transformOrigin: "50% 50%" }, ${sceneStartSec});`);
    push(`<div style="position:absolute; left:50%; top:45%; width:60vw; height:60vw; margin:-30vw 0 0 -30vw; border-radius:50%; background:radial-gradient(circle, ${rgba(c1, 0.28)}, transparent 60%); filter:blur(30px);"></div>`);
  } else if (style === 'circuit') {
    push(`<div style="position:absolute; inset:0; background-image:linear-gradient(${rgba(c0, 0.14)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(c0, 0.14)} 1px, transparent 1px); background-size:64px 64px;"></div>`);
    push(`<div style="position:absolute; inset:0; background-image:linear-gradient(${rgba(c1, 0.22)} 2px, transparent 2px), linear-gradient(90deg, ${rgba(c1, 0.22)} 2px, transparent 2px); background-size:256px 256px;"></div>`);
    const scanId = ctx.makeId('scan');
    push(`<div id="${scanId}" style="position:absolute; left:0; right:0; top:0; height:22%; background:linear-gradient(${rgba(c1, 0)}, ${rgba(c1, 0.28)}, ${rgba(c1, 0)}); mix-blend-mode:screen;"></div>`,
      `  tl.fromTo("#${scanId}", { y: ${-H * 0.25} }, { y: ${H}, duration: ${round(sceneDurSec / Math.max(1, Math.round(sceneDurSec / 2.2)), 3)}, ease: "none", repeat: ${Math.max(1, Math.round(sceneDurSec / 2.2)) - 1} }, ${sceneStartSec});`);
    push(`<div style="position:absolute; inset:0; background:repeating-linear-gradient(0deg, transparent, transparent 3px, ${rgba('#000000', 0.25)} 3px, ${rgba('#000000', 0.25)} 4px); mix-blend-mode:multiply;"></div>`);
  } else { // aurora
    for (let i = 0; i < 4; i++) {
      const c = mixHex(rng.bool() ? c0 : c1, '#ffffff', rng.range(0, 0.2));
      const top = round(rng.range(-10, 60), 1);
      const rot = round(rng.range(-25, 25), 1);
      const id = ctx.makeId('aur');
      push(`<div id="${id}" style="position:absolute; left:-30%; right:-30%; top:${top}%; height:${round(rng.range(14, 30), 1)}%; background:linear-gradient(90deg, transparent, ${rgba(c, 0.5)}, transparent); filter:blur(28px); transform:rotate(${rot}deg);"></div>`,
        `  tl.fromTo("#${id}", { x: ${round(rng.range(-200, -60), 1)}, opacity: 0.4 }, { x: ${round(rng.range(60, 220), 1)}, opacity: 0.9, duration: ${sceneDurSec}, ease: "sine.inOut" }, ${sceneStartSec});`);
    }
  }

  // universal cinematic finish: soft grain-ish vignette + inner shadow
  push(`<div style="position:absolute; inset:0; box-shadow:inset 0 0 260px rgba(0,0,0,0.85); pointer-events:none;"></div>`);
  push(`<div style="position:absolute; inset:0; background:radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.55)); pointer-events:none;"></div>`);

  return { style, html: layers.join('\n        '), js: scripts.join('\n') };
}

/* ================================= SCENE =============================== */

const MG_RENDERERS = {
  pulse_wave: renderPulseWave,
  hud_ring: renderHudRing,
  kinetic_text: renderKineticText,
};

function renderScene(scene, ctx) {
  const startSec = framesToSeconds(scene.startFrame ?? 0, ctx.fps);
  const endSec = framesToSeconds(scene.endFrame ?? 0, ctx.fps);
  const durSec = round(Math.max(1 / ctx.fps, endSec - startSec), 4);
  const sceneId = String(scene.sceneId || ctx.makeId('scene'));
  const domId = sceneId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || ctx.makeId('scene');

  // Scene seed drives background choice + palette rotation + mg fallbacks.
  const mgText = (Array.isArray(scene.motionGraphics) ? scene.motionGraphics : [])
    .map((g) => g?.properties?.text || g?.type || '').join('|');
  const rng = makeRng(`${sceneId}|${mgText}|${scene.narrationScript || ''}`);

  const rawColors = Array.isArray(scene.backgroundAsset?.colors) ? scene.backgroundAsset.colors : [];
  const c0 = safeColor(rawColors[0], rng.pick(['#00E5FF', '#FF007F', '#7C3AED', '#00A8E8', '#FFD700']));
  const c1 = safeColor(rawColors[1], mixHex(c0, rng.pick(['#FF007F', '#00E5FF', '#50C878', '#FF6B00']), 0.6));
  ctx.scenePalette = [c0, c1, mixHex(c0, c1, 0.5)];

  const bg = renderBackground(scene, startSec, durSec, ctx, rng, [c0, c1]);

  const parts = [];
  const scripts = [];
  for (const mg of (Array.isArray(scene.motionGraphics) ? scene.motionGraphics : [])) {
    const renderer = MG_RENDERERS[mg && mg.type];
    if (!renderer) continue;
    const out = renderer(mg, ctx);
    parts.push(out.html);
    if (out.js) scripts.push(out.js);
  }

  const html = `
    <div id="${escapeHtml(domId)}" class="scene clip" data-scene-id="${escapeHtml(sceneId)}" data-bg-style="${bg.style}"
         data-start="${startSec}" data-duration="${durSec}" data-track-index="${ctx.nextTrack()}"
         style="position:absolute; inset:0; overflow:hidden; background:#01020a;">
      <div style="position:absolute; inset:0;">
        ${bg.html}
      </div>
${parts.join('\n')}
    </div>`;

  return { html, js: [bg.js, ...scripts].filter(Boolean).join('\n') };
}

/* ================================= ENTRY =============================== */

/**
 * Translate a Groq v2 (variant-aware) contract into a cinematic HyperFrames
 * index.html string.
 *
 * @param {object|string} contract
 * @param {object} [options]
 * @param {string} [options.compositionId="main"]
 * @param {string} [options.title="PromptCut Shadow Render"]
 * @returns {string}
 */
export function translateJsonToHyperFrames(contract, options = {}) {
  const parsed = typeof contract === 'string' ? JSON.parse(contract) : contract;
  if (!parsed || typeof parsed !== 'object') {
    throw new TypeError('translateJsonToHyperFrames: contract must be an object or JSON string');
  }

  const settings = parsed.projectSettings || {};
  const width = clamp(num(settings.width, 1920), 16, 7680);
  const height = clamp(num(settings.height, 1080), 16, 4320);
  const fps = clamp(num(settings.fps, 30), 1, 240);

  const scenes = Array.isArray(parsed?.timeline?.scenes) ? parsed.timeline.scenes : [];
  if (scenes.length === 0) {
    throw new Error('translateJsonToHyperFrames: contract has no timeline.scenes to translate');
  }

  const derivedEnd = scenes.reduce((mx, s) => Math.max(mx, num(s.endFrame, 0)), 0);
  const totalFrames = Math.max(1, num(settings.totalDurationInFrames, derivedEnd));
  const totalSec = framesToSeconds(totalFrames, fps);

  const compositionId = options.compositionId || 'main';
  const title = options.title || 'PromptCut Shadow Render';

  const makeId = createIdFactory();
  let track = 0;
  const ctx = {
    fps, width, height, makeId,
    nextTrack: () => track++,
    scenePalette: ['#00E5FF', '#FF007F', '#7C3AED'],
  };

  const sceneHtml = [];
  const sceneJs = [];
  for (const scene of scenes) {
    const out = renderScene(scene, ctx);
    sceneHtml.push(out.html);
    if (out.js) sceneJs.push(out.js);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${width}, height=${height}">
    <title>${escapeHtml(title)}</title>
    <script src="${GSAP_CDN}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        margin: 0; width: ${width}px; height: ${height}px; overflow: hidden;
        background: #01020a;
        font-family: "Inter", "Montserrat", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .scene { overflow: hidden; }
      code, pre, .monospace { font-family: "JetBrains Mono", monospace; }
    </style>
  </head>
  <body>
    <div data-hf-id="promptcut-shadow" id="root" data-composition-id="${escapeHtml(compositionId)}"
         data-start="0" data-duration="${totalSec}" data-fps="${fps}"
         data-width="${width}" data-height="${height}"
         style="position:relative; width:${width}px; height:${height}px; background:#01020a;">
${sceneHtml.join('\n')}
    </div>

    <script>
      // Single paused, seekable root timeline — HyperFrames seeks this per frame
      // (CLAUDE.md Key Rule #3). Every animation below is positioned at its
      // absolute second offset. All geometry above was baked deterministically.
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

${sceneJs.join('\n')}

      // Pin total length so seeking maps 1:1 to the full rendered range.
      tl.to({}, { duration: ${totalSec} }, 0);

      window.__timelines[${jsString(compositionId)}] = tl;
    </script>
  </body>
</html>
`;
}

export default translateJsonToHyperFrames;
