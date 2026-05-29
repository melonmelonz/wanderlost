// src/Inventory.tsx
import { useEffect, useState } from 'preact/hooks';
import { hudState, subscribe, toggleInventory, openCharacterSelect } from './game/hud-bus';
import { SPECIMEN_FLAVOR } from './content/flavor-specimens';
import { isMuted, toggleMute } from './game/audio';
import { setMuted } from './game/hud-bus';

type Tab = 'specimens' | 'journal' | 'settings';

export function Inventory() {
  const [, force] = useState(0);
  const [tab, setTab] = useState<Tab>('specimens');
  useEffect(() => subscribe(() => force(n => n + 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && hudState.inventoryOpen) toggleInventory(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  if (!hudState.inventoryOpen) return null;

  const specimenEntries = Object.entries(hudState.specimens).filter(([, n]) => n > 0);

  return (
    <div onClick={toggleInventory} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={panel}>
        <div style={tabRow}>
          {(['specimens', 'journal', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...tabBtn, ...(tab === t ? tabActive : {}) }}>{t}</button>
          ))}
          <button style={closeBtn} onClick={toggleInventory}>close</button>
        </div>

        {tab === 'specimens' && (
          <div style={grid}>
            {specimenEntries.length === 0 && <p style={dim}>nothing found yet. the grass is holding out on you.</p>}
            {specimenEntries.map(([k, n]) => {
              const f = SPECIMEN_FLAVOR[Number(k)];
              return (
                <div key={k} style={cell}>
                  <div style={{ fontSize: 12, color: '#e8e0d0' }}>{f?.name ?? `specimen ${k}`}</div>
                  <div style={{ fontSize: 10, color: '#9a9080', fontStyle: 'italic' }}>{f?.note}</div>
                  <div style={{ fontSize: 11, color: '#d4a437', marginTop: 4 }}>x{n}</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'journal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hudState.journal.length === 0 && <p style={dim}>no notes recovered. someone was here before you.</p>}
            {hudState.journal.map(e => (
              <div key={e.id} style={{ borderLeft: '2px solid #4a4338', paddingLeft: 10 }}>
                <div style={{ fontSize: 9, color: '#6a6358' }}>day {e.day}</div>
                <div style={{ fontSize: 11, color: '#c8c0b0', fontStyle: 'italic' }}>{e.text}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button style={tabBtn} onClick={() => { const m = toggleMute(); setMuted(m); force(n => n + 1); }}>
              audio: {isMuted() ? 'muted' : 'on'}
            </button>
            <button style={tabBtn} onClick={() => { toggleInventory(); openCharacterSelect(); }}>
              change character
            </button>
            <p style={dim}>WASD / arrows to walk. E or space to open. M mutes. I or Tab for this.</p>
            <p style={dim}>wanderlost — everything you find, someone else cannot.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' } as const;
const panel = { width: 'min(560px,90vw)', maxHeight: '80vh', overflow: 'auto', background: '#16140f', border: '1px solid #4a4338', padding: '18px 20px', fontFamily: '"Space Mono",monospace' } as const;
const tabRow = { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' } as const;
const tabBtn = { background: 'transparent', border: '1px solid #4a4338', color: '#9a9080', padding: '4px 10px', fontSize: 11, cursor: 'pointer', textTransform: 'lowercase' } as const;
const tabActive = { color: '#d4a437', borderColor: '#d4a437' } as const;
const closeBtn = { ...tabBtn, marginLeft: 'auto' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 } as const;
const cell = { border: '1px solid #2a2820', padding: '8px 10px' } as const;
const dim = { color: '#6a6358', fontSize: 11, fontStyle: 'italic' } as const;
