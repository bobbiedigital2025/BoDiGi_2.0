'use client';

/**
 * StardustBackground — a canvas of drifting stars that gently scatter away
 * from the cursor, then settle back. Pure effect layer: pointer-events-none,
 * absolutely positioned, DPR-aware, honors prefers-reduced-motion.
 *
 * Neon palette matched to the BoDiGi logo (pink / violet / cyan). Users can
 * switch it off: listens for the 'stardust-toggle' CustomEvent and reads
 * localStorage['bodigi-stardust'] ('off' disables). Purely client-side.
 *
 * Drop <StardustBackground /> as the first child of any relative container.
 */

import { useEffect, useRef } from 'react';
import { useState } from 'react';

interface Star {
  x: number; y: number;      // position
  vx: number; vy: number;    // drift velocity
  r: number;                 // radius
  hue: number;               // neon logo hues
  phase: number;             // twinkle phase
  speed: number;             // twinkle speed
}

const HUES = [320, 320, 265, 265, 185, 185, 0]; // neon pink, violet, cyan (logo) + rare white
const DENSITY = 1 / 9000;        // stars per px²
const MOUSE_RADIUS = 140;
const MOUSE_FORCE = 0.6;

const PREF_KEY = 'bodigi-stardust';

/** Flip the user pref and notify all mounted backgrounds. */
export function toggleStardust(): boolean {
  const next = localStorage.getItem(PREF_KEY) === 'off' ? 'on' : 'off';
  localStorage.setItem(PREF_KEY, next);
  window.dispatchEvent(new CustomEvent('stardust-toggle', { detail: next }));
  return next === 'on';
}

export function stardustEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(PREF_KEY) !== 'off';
}

export default function StardustBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(stardustEnabled());
    const onToggle = (e: Event) => setEnabled((e as CustomEvent).detail !== 'off');
    window.addEventListener('stardust-toggle', onToggle);
    return () => window.removeEventListener('stardust-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let stars: Star[] = [];
    let raf = 0;
    const mouse = { x: -9999, y: -9999 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const seed = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(220, Math.floor(w * h * DENSITY));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: Math.random() * 1.6 + 0.4,
        hue: HUES[Math.floor(Math.random() * HUES.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.02,
      }));
    };

    const tick = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        // drift
        s.x += s.vx;
        s.y += s.vy;

        // mouse repulsion — stars scatter softly, then drift on
        const dx = s.x - mouse.x;
        const dy = s.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_RADIUS * MOUSE_RADIUS && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (1 - d / MOUSE_RADIUS) * MOUSE_FORCE;
          s.x += (dx / d) * f * 3;
          s.y += (dy / d) * f * 3;
        }

        // wrap edges
        if (s.x < -4) s.x = w + 4;
        if (s.x > w + 4) s.x = -4;
        if (s.y < -4) s.y = h + 4;
        if (s.y > h + 4) s.y = -4;

        // twinkle
        s.phase += s.speed;
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase));

        // soft neon halo on the larger stars
        if (s.r > 1.2 && s.hue !== 0) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
          g.addColorStop(0, `hsla(${s.hue}, 100%, 70%, ${0.35 * tw})`);
          g.addColorStop(1, `hsla(${s.hue}, 100%, 70%, 0)`);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.hue === 0
          ? `rgba(255,255,255,${0.75 * tw})`
          : `hsla(${s.hue}, 100%, 70%, ${0.85 * tw})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    seed();
    tick();
    window.addEventListener('resize', seed);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', seed);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
