// src/Dpad.tsx
// On-screen 8-direction pad for touch devices. Writes a direction vector through `set`.
import { useEffect, useRef, useState } from 'preact/hooks';

const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export function Dpad({ set, onAction }: { set: (dx: number, dy: number) => void; onAction: () => void }) {
  const [show] = useState(isTouch);
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  useEffect(() => {
    if (!show) return;
    const el = ref.current!;
    const handle = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) { set(0, 0); active.current = false; return; }
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      const dead = r.width * 0.18;
      set(Math.abs(dx) < dead ? 0 : Math.sign(dx), Math.abs(dy) < dead ? 0 : Math.sign(dy));
      active.current = true;
      e.preventDefault();
    };
    const end = () => { set(0, 0); active.current = false; };
    el.addEventListener('touchstart', handle, { passive: false });
    el.addEventListener('touchmove', handle, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', handle);
      el.removeEventListener('touchmove', handle);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [show]);

  if (!show) return null;
  return (
    <>
      <div ref={ref} style={pad}>
        <div style={nub} />
      </div>
      <button style={actionBtn} onClick={onAction}>E</button>
    </>
  );
}

const pad = { position: 'fixed', left: 24, bottom: 28, width: 116, height: 116, borderRadius: '50%', border: '1px solid rgba(212,164,55,0.4)', background: 'rgba(20,18,14,0.4)', zIndex: 40, touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
const nub = { width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,164,55,0.3)' } as const;
const actionBtn = { position: 'fixed', right: 28, bottom: 40, width: 64, height: 64, borderRadius: '50%', border: '1px solid rgba(212,164,55,0.5)', background: 'rgba(20,18,14,0.5)', color: '#d4a437', fontSize: 18, fontFamily: '"Space Mono",monospace', zIndex: 40 } as const;
