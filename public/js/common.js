// Shared helpers for the kid app and the parent dashboard.

export async function api(path, opts = {}) {
  const method = opts.method || (opts.body !== undefined ? "POST" : "GET");
  const r = await fetch("/api" + path, {
    method, credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !opts.noRedirect) { location.href = location.pathname.startsWith("/parent") ? "/parent-login" : "/"; throw new Error("Please log in"); }
  if (!r.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function toast(msg, kind = "info") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = `toast ${kind}`; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2800); setTimeout(() => t.remove(), 3300);
}

export const fmtDur = (s) => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`; };
export const istDate = (iso) => new Date(new Date(iso).getTime() + 330 * 60000);
export const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = istDate(iso), now = istDate(new Date().toISOString());
  const day = d.toISOString().slice(0, 10), today = now.toISOString().slice(0, 10);
  const yest = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  const label = day === today ? "Today" : day === yest ? "Yesterday" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${label}, ${time}`;
};

// Asset slots: <div data-asset="/assets/x.webp">fallback SVG</div> → swapped for the image if it exists.
const missing = new Set(JSON.parse(sessionStorage.getItem("bc_missing") || "[]"));
export function hydrateAssets(root = document) {
  root.querySelectorAll("[data-asset]:not([data-done])").forEach((el) => {
    el.dataset.done = "1";
    const src = el.dataset.asset;
    if (missing.has(src)) return;
    const img = new Image();
    img.alt = el.getAttribute("aria-label") || "";
    img.onload = () => { el.innerHTML = ""; el.appendChild(img); el.classList.add("has-img"); };
    img.onerror = () => { missing.add(src); try { sessionStorage.setItem("bc_missing", JSON.stringify([...missing])); } catch (e) {} };
    img.src = src;
  });
}

// ---- sound: uses /assets/sfx/<name>.mp3 if present, otherwise synthesises a sound ----
let ctx = null;
export const sound = {
  get on() { try { return localStorage.getItem("bc_sound") !== "off"; } catch (e) { return true; } },
  set on(v) { try { localStorage.setItem("bc_sound", v ? "on" : "off"); } catch (e) {} },
};
const files = {};
export function sfx(name) {
  if (!sound.on) return;
  const src = `/assets/sfx/${name}.mp3`;
  if (!missing.has(src)) {
    files[name] ||= new Audio(src);
    const a = files[name];
    a.currentTime = 0;
    a.play().then(() => {}).catch(() => { missing.add(src); synth(name); });
    a.onerror = () => { missing.add(src); };
    return;
  }
  synth(name);
}
function synth(name) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    const tone = (f, d, type = "sine", v = 0.25, at = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at);
      if (name === "out") o.frequency.exponentialRampToValueAtTime(f / 3, t + at + d);
      g.gain.setValueAtTime(v, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + d);
      o.connect(g).connect(ctx.destination); o.start(t + at); o.stop(t + at + d);
    };
    const noise = (d, v = 0.2, at = 0) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * d, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / ch.length);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 1200; g.gain.value = v; s.buffer = buf;
      s.connect(f).connect(g).connect(ctx.destination); s.start(t + at);
    };
    if (name === "hit") { tone(900, 0.12, "triangle", 0.4); noise(0.08, 0.3); }
    else if (name === "four") { tone(900, 0.12, "triangle", 0.4); noise(0.9, 0.25, 0.1); }
    else if (name === "six") { tone(900, 0.12, "triangle", 0.4); noise(1.6, 0.35, 0.1); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, "square", 0.08, 0.2 + i * 0.1)); }
    else if (name === "out") { tone(440, 0.6, "sawtooth", 0.12); }
    else if (name === "badge") { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, "triangle", 0.15, i * 0.12)); }
    else if (name === "click") { tone(660, 0.05, "square", 0.05); }
  } catch (e) { /* audio not available */ }
}

// ---- confetti made of little bricks ----
export function confetti(n = 120) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  c.className = "confetti"; document.body.appendChild(c);
  const W = (c.width = innerWidth), H = (c.height = innerHeight), g = c.getContext("2d");
  const cols = ["#e03131", "#fcc419", "#1c7ed6", "#2f9e44", "#f76707", "#ae3ec9"];
  const ps = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.45, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 6, r: Math.random() * 6, w: 10 + Math.random() * 8, c: cols[(Math.random() * 6) | 0], s: (Math.random() - 0.5) * 0.3 }));
  let f = 0;
  (function step() {
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.5; p.x += p.vx; p.y += p.vy; p.r += p.s;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      g.fillRect(-p.w / 3, -p.w / 2.2, p.w / 4, p.w / 5); g.fillRect(p.w / 12, -p.w / 2.2, p.w / 4, p.w / 5); g.restore();
    }
    if (++f < 150) requestAnimationFrame(step); else c.remove();
  })();
}

export function logEvent(type, detail = "", session_id = null) {
  return api("/event", { body: { type, detail, session_id } }).catch(() => {});
}
