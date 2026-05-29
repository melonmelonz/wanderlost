// src/HUD.tsx
import { useEffect, useState } from 'preact/hooks';
import { hudState, subscribe } from './game/hud-bus';

export function HUD() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force(n => n + 1)), []);
  const total = Object.values(hudState.specimens).reduce((a, b) => a + b, 0);
  const flashed = performance.now() - hudState.specimenFlash < 400;
  return (
    <>
      <div style={{
        position: 'fixed', top: 12, right: 14, fontSize: 11, letterSpacing: '0.18em',
        color: '#d4a437', textShadow: '0 0 12px rgba(212,164,55,0.4)',
        transform: flashed ? 'scale(1.25)' : 'scale(1)', transition: 'transform 0.2s',
      }}>
        specimens: {total}
      </div>
      {hudState.peerCount > 0 && (
        <div style={{ position: 'fixed', top: 30, right: 14, fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0,220,255,0.6)' }}>
          {hudState.peerCount} other{hudState.peerCount === 1 ? '' : 's'} out here
        </div>
      )}
      {hudState.muted && (
        <div style={{ position: 'fixed', top: 12, left: 14, fontSize: 10, color: '#6a6358' }}>muted</div>
      )}
      {hudState.interact && (
        <div style={{
          position: 'fixed', left: '50%', bottom: '12%', transform: 'translateX(-50%)',
          fontSize: 12, lineHeight: 1.5, letterSpacing: '0.04em', color: '#cfe8d8',
          textAlign: 'center', maxWidth: '60vw', fontStyle: 'italic',
          textShadow: '0 1px 8px #000', padding: '8px 16px',
          background: 'rgba(10,18,16,0.55)', border: '1px solid rgba(120,220,255,0.18)',
          borderRadius: 4, backdropFilter: 'blur(2px)', animation: 'wl-fade 4.2s ease',
        }}>
          {hudState.interact}
        </div>
      )}
      {hudState.dayCard && (
        <div style={{
          position: 'fixed', left: '50%', top: '14%', transform: 'translateX(-50%)',
          fontSize: 13, letterSpacing: '0.12em', color: '#e8e0d0', textAlign: 'center',
          maxWidth: '70vw', textShadow: '0 1px 8px #000', animation: 'wl-fade 3.5s ease',
        }}>
          {hudState.dayCard}
        </div>
      )}
    </>
  );
}
