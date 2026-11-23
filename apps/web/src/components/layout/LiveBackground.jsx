import { useEffect, useRef } from 'react';
import { SEASONS } from '../../lib/season.js';

// The page's moving backdrop: slowly drifting color blobs (CSS, see index.css)
// and the season's particles on a canvas: petals in spring, glowing motes in
// summer, leaves in autumn, snow in winter. It sits behind everything, ignores
// the mouse, and stops when motion is off or the tab is hidden.

const PALETTES = {
  petal: ['#f9a8d4', '#f472b6', '#fbcfe8', '#fda4af'],
  glow: ['#fde047', '#facc15', '#67e8f9', '#fdba74'],
  leaf: ['#f97316', '#ea580c', '#dc2626', '#d97706', '#b45309'],
  snow: ['#ffffff', '#e0f2fe', '#bae6fd'],
};

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function createParticle(kind, width, height, anywhere) {
  const rising = kind === 'glow';
  return {
    x: rand(0, width),
    y: anywhere ? rand(0, height) : rising ? height + 20 : -20,
    size:
      kind === 'snow' ? rand(1.5, 4) : kind === 'glow' ? rand(2, 5) : rand(7, 13),
    speed: kind === 'snow' ? rand(0.3, 0.9) : kind === 'glow' ? rand(0.15, 0.45) : rand(0.4, 1.1),
    sway: rand(0.4, 1.4),
    phase: rand(0, Math.PI * 2),
    angle: rand(0, Math.PI * 2),
    spin: rand(-0.02, 0.02),
    color: pick(PALETTES[kind]),
  };
}

function drawParticle(ctx, kind, p, dark) {
  ctx.save();
  ctx.translate(p.x, p.y);

  if (kind === 'snow') {
    ctx.globalAlpha = dark ? 0.85 : 0.9;
    ctx.fillStyle = dark ? p.color : '#93c5fd';
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'glow') {
    const twinkle = 0.45 + 0.35 * Math.sin(p.phase * 2);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 4);
    glow.addColorStop(0, p.color);
    glow.addColorStop(1, 'transparent');
    ctx.globalAlpha = twinkle * (dark ? 0.9 : 0.6);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'petal') {
    ctx.rotate(p.angle);
    ctx.globalAlpha = dark ? 0.7 : 0.75;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Leaf: two curves meeting at the tips, with a center vein.
    ctx.rotate(p.angle);
    ctx.globalAlpha = dark ? 0.75 : 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-p.size, 0);
    ctx.quadraticCurveTo(0, -p.size * 0.8, p.size, 0);
    ctx.quadraticCurveTo(0, p.size * 0.8, -p.size, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-p.size, 0);
    ctx.lineTo(p.size, 0);
    ctx.stroke();
  }

  ctx.restore();
}

function Particles({ kind }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!ctx || typeof window.requestAnimationFrame !== 'function') return undefined;

    let width = 0;
    let height = 0;
    let particles = [];
    let frame = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Fewer particles on small screens.
      const count = Math.round(Math.min(46, Math.max(16, width / 32)));
      particles = Array.from({ length: count }, () => createParticle(kind, width, height, true));
    }

    function step() {
      const dark = document.documentElement.classList.contains('dark');
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.phase += 0.012;
        p.angle += p.spin;
        p.x += Math.sin(p.phase) * p.sway * 0.5;
        p.y += kind === 'glow' ? -p.speed : p.speed;

        const gone = kind === 'glow' ? p.y < -30 : p.y > height + 30;
        if (gone || p.x < -40 || p.x > width + 40) {
          particles[i] = createParticle(kind, width, height, false);
          continue;
        }
        drawParticle(ctx, kind, p, dark);
      }
      frame = window.requestAnimationFrame(step);
    }

    function onVisibility() {
      window.cancelAnimationFrame(frame);
      if (!document.hidden) frame = window.requestAnimationFrame(step);
    }

    resize();
    frame = window.requestAnimationFrame(step);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [kind]);

  return <canvas ref={canvasRef} className="live-particles" aria-hidden="true" />;
}

export function LiveBackground({ season, motion }) {
  return (
    <div className="live-bg" aria-hidden="true">
      <div className="live-blob live-blob-1" />
      <div className="live-blob live-blob-2" />
      <div className="live-blob live-blob-3" />
      {motion && <Particles key={season} kind={SEASONS[season].particle} />}
    </div>
  );
}
