import { useEffect, useRef } from "react";
import { subscribeTauriEvent } from "../../lib/tauriListen";
import type { BackgroundStyle } from "../lib/backgroundStyle";
import {
  DEFAULT_BACKGROUND_TUNING,
  type BackgroundTuning,
} from "../lib/backgroundTuning";
import "./AmbientVisualizer.css";

const clampAlpha = (value: number) => Math.min(1, Math.max(0, value));

const IDLE_ENERGY = 0.35;
const DECAY_PER_SEC = 0.35;
const PULSE_BOOST = 0.7;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ---- Drifting orbs / barely-breathing (same renderer, drift toggled off) --

type Orb = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  breathPhase: number;
};

function setupOrbs(colors: string[], w: number, h: number): Orb[] {
  return Array.from({ length: 4 }, (_, i) => ({
    x: rand(w * 0.15, w * 0.85),
    y: rand(h * 0.15, h * 0.85),
    vx: rand(-1, 1) * (w * 0.02),
    vy: rand(-1, 1) * (h * 0.02),
    color: colors[i % colors.length],
    breathPhase: rand(0, Math.PI * 2),
  }));
}

function stepOrbs(
  orbs: Orb[],
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  energy: number,
  dt: number,
  drift: boolean,
  intensity: number,
  t: number,
) {
  ctx.clearRect(0, 0, w, h);
  for (const orb of orbs) {
    if (drift) {
      // Small random nudges instead of a fixed path — non-repeating drift.
      orb.vx += rand(-1, 1) * w * 0.01 * dt;
      orb.vy += rand(-1, 1) * h * 0.01 * dt;
      const maxSpeed = w * 0.12 * (0.6 + energy * 0.8);
      const speed = Math.hypot(orb.vx, orb.vy) || 1;
      const scale = Math.min(1, maxSpeed / speed);
      orb.vx *= scale;
      orb.vy *= scale;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      if (orb.x < w * 0.05 || orb.x > w * 0.95) orb.vx *= -1;
      if (orb.y < h * 0.05 || orb.y > h * 0.95) orb.vy *= -1;
      orb.x = Math.min(w * 0.95, Math.max(w * 0.05, orb.x));
      orb.y = Math.min(h * 0.95, Math.max(h * 0.05, orb.y));
    }
    // "Still" has no drift, so it needs its own baseline motion — a slow
    // per-orb size/brightness pulse — or it would read as a frozen image.
    const breathe = drift ? 0 : Math.sin(t * 2.1 + orb.breathPhase) * 0.5 + 0.5;
    const radius =
      Math.min(w, h) * (0.24 + energy * 0.12) * (drift ? 1 : 0.85 + breathe * 0.3);
    const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, radius);
    grad.addColorStop(0, orb.color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.globalAlpha = clampAlpha(
      (0.5 + energy * 0.4 + (drift ? 0 : breathe * 0.2)) * intensity,
    );
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Organic morph: full-bleed ribbons following randomized keyframes -----

type NoiseRibbon = {
  color: string;
  baseY: number;
  thickness: number;
  points: number[];
  current: number[];
  target: number[];
  cycleStart: number;
  cycleDuration: number;
};

const CONTROL_POINTS = 5;

function retarget(ribbon: NoiseRibbon, now: number, ampFrac: number) {
  ribbon.current = ribbon.target;
  ribbon.target = ribbon.points.map(() => rand(-ampFrac, ampFrac));
  ribbon.cycleStart = now;
  ribbon.cycleDuration = rand(2.5, 4.5);
}

function setupNoise(colors: string[]): NoiseRibbon[] {
  return colors.map((color, i) => {
    const points = Array.from({ length: CONTROL_POINTS }, () => 0);
    const ribbon: NoiseRibbon = {
      color,
      baseY: 0.28 + i * 0.44,
      thickness: 0.3 - i * 0.03,
      points,
      current: points.map(() => 0),
      target: points.map(() => rand(-0.15, 0.15)),
      cycleStart: -i * 1.5,
      cycleDuration: rand(2.5, 4.5),
    };
    return ribbon;
  });
}

function sampleCurve(values: number[], p: number) {
  const seg = p * (values.length - 1);
  const i0 = Math.floor(seg);
  const i1 = Math.min(values.length - 1, i0 + 1);
  return lerp(values[i0], values[i1], smoothstep(seg - i0));
}

function stepNoise(
  ribbons: NoiseRibbon[],
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  energy: number,
  now: number,
  intensity: number,
) {
  ctx.clearRect(0, 0, w, h);
  const ampFrac = 0.14 + energy * 0.1;

  for (const ribbon of ribbons) {
    let progress = (now - ribbon.cycleStart) / ribbon.cycleDuration;
    if (progress >= 1) {
      retarget(ribbon, now, ampFrac);
      progress = 0;
    }
    const eased = smoothstep(Math.min(1, Math.max(0, progress)));
    for (let i = 0; i < ribbon.points.length; i++) {
      ribbon.points[i] = lerp(ribbon.current[i], ribbon.target[i], eased);
    }

    const centerY = h * ribbon.baseY;
    const amp = h;
    const thickness = h * ribbon.thickness * (0.9 + energy * 0.5);

    const topY = (x: number) =>
      centerY + sampleCurve(ribbon.points, x / w) * amp - thickness / 2;
    const bottomY = (x: number) =>
      centerY + sampleCurve(ribbon.points, x / w) * amp + thickness / 2;

    const step = w / 40;
    ctx.beginPath();
    for (let x = 0; x <= w + step; x += step) {
      const y = topY(x);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let x = w; x >= -step; x -= step) ctx.lineTo(x, bottomY(x));
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, centerY - amp, 0, centerY + amp);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.35, ribbon.color);
    grad.addColorStop(0.65, ribbon.color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.globalAlpha = clampAlpha((0.55 + energy * 0.35) * intensity);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Particle field --------------------------------------------------

type Particle = { x: number; y: number; vx: number; vy: number; size: number; color: string };

function setupParticles(colors: string[], w: number, h: number): Particle[] {
  return Array.from({ length: 46 }, (_, i) => ({
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-1, 1) * (w * 0.02),
    vy: rand(-1, 1) * (h * 0.02),
    size: rand(0.03, 0.055) * Math.min(w, h),
    color: colors[i % colors.length],
  }));
}

function stepParticles(
  particles: Particle[],
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  energy: number,
  dt: number,
  intensity: number,
) {
  ctx.clearRect(0, 0, w, h);
  const speedScale = 0.6 + energy * 1.6;
  for (const p of particles) {
    p.x = (p.x + p.vx * speedScale * dt + w) % w;
    p.y = (p.y + p.vy * speedScale * dt + h) % h;
    const radius = p.size * (1 + energy * 0.6);
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.globalAlpha = clampAlpha((0.6 + energy * 0.35) * intensity);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Component ---------------------------------------------------------

/**
 * Ambient canvas layer for the "Doing" phase, in one of a few styles picked
 * under Background in Settings (see backgroundStyle.ts). Softened into a glow
 * by a CSS blur on the canvas element (cheaper and simpler than a per-frame
 * ctx.filter blur or manual gradient blending). Amplitude/speed/brightness
 * rise briefly on an activity-pulse event (task completions, check-ins),
 * then decay back to an idle drift. Mount/unmount (not just hide) so it
 * costs nothing outside the doing phase.
 */
export function AmbientVisualizer({
  active,
  style,
  tuning = DEFAULT_BACKGROUND_TUNING,
}: {
  active: boolean;
  style: BackgroundStyle;
  tuning?: BackgroundTuning;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(IDLE_ENERGY);
  // A ref (not a frame-loop dependency) so dragging a tuning slider changes
  // speed/intensity live without resetting orb/particle positions.
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  useEffect(() => {
    if (!active) return;
    return subscribeTauriEvent("activity-pulse", () => {
      energyRef.current = Math.min(1, energyRef.current + PULSE_BOOST);
    });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const cssColors = getComputedStyle(canvas);
    const colors = [
      cssColors.getPropertyValue("--doing").trim() || "#3f6b52",
      cssColors.getPropertyValue("--accent").trim() || "#3f6cb7",
    ];

    // No devicePixelRatio scaling: the blur discards pixel-level detail
    // anyway, so drawing at CSS pixel resolution keeps this cheap.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Particles are individually small; the default blur (tuned for full-bleed
    // ribbons/orbs) would wash them into nothing, so it gets a lighter one.
    canvas.style.filter = style === "particles" ? "blur(16px) saturate(1.6)" : "";

    const orbs = style === "orbs" || style === "still"
      ? setupOrbs(colors, canvas.width, canvas.height)
      : null;
    const noise = style === "noise" ? setupNoise(colors) : null;
    const particles = style === "particles"
      ? setupParticles(colors, canvas.width, canvas.height)
      : null;

    let raf = 0;
    let last = performance.now();
    let t = 0;

    const frame = (now: number) => {
      const rawDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dt = reduceMotion ? rawDt * 0.25 : rawDt;
      // Speed scales motion only, not the pulse-decay rate below — otherwise
      // a faster setting would also make activity pulses fade quicker.
      const motionDt = dt * tuningRef.current.speed;
      const intensity = tuningRef.current.intensity;
      t += motionDt;
      energyRef.current = Math.max(
        IDLE_ENERGY,
        energyRef.current - DECAY_PER_SEC * dt,
      );
      const energy = energyRef.current;
      const w = canvas.width;
      const h = canvas.height;

      if (orbs) stepOrbs(orbs, ctx, w, h, energy, motionDt, style === "orbs", intensity, t);
      else if (noise) stepNoise(noise, ctx, w, h, energy, t, intensity);
      else if (particles) stepParticles(particles, ctx, w, h, energy, motionDt, intensity);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, style]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="ambient-visualizer" aria-hidden="true" />;
}
