// src/CharacterSelect.tsx
import { useState } from 'preact/hooks';

export interface CharDef { id: string; name: string; blurb: string; preview: string; }

export const CHARACTERS: CharDef[] = [
  { id: 'doug',           name: 'Doug', blurb: 'lost his ship. drifts more than walks.', preview: '/assets/characters/doug/rotations/south.png' },
  { id: 'red-hair-v2',    name: 'Red',  blurb: 'came looking for someone.',              preview: '/assets/characters/red-hair-v2/rotations/south.png' },
  { id: 'green-alien-v2', name: 'Vix',  blurb: 'native. unimpressed by visitors.',       preview: '/assets/characters/green-alien-v2/rotations/south.png' },
  { id: 'crab-head-v2',   name: 'Pott', blurb: 'not actually a crab. long story.',        preview: '/assets/characters/crab-head-v2/rotations/south.png' },
];

export function CharacterSelect({ onPick, current }: { onPick: (id: string) => void; current?: string }) {
  const [sel, setSel] = useState(current ?? 'doug');
  return (
    <div style={overlay}>
      <div style={panel}>
        <h1 style={{ fontSize: 20, letterSpacing: '0.24em', color: '#e8e0d0', margin: '0 0 6px' }}>wanderlost</h1>
        <p style={{ fontSize: 11, color: '#9a9080', fontStyle: 'italic', margin: '0 0 22px' }}>
          choose who you'll be out here. you can change later.
        </p>
        <div style={row}>
          {CHARACTERS.map(c => (
            <button key={c.id} onClick={() => setSel(c.id)} style={{ ...card, ...(sel === c.id ? cardSel : {}) }}>
              <img src={c.preview} width={64} height={64} style={{ imageRendering: 'pixelated' }} alt={c.name} />
              <div style={{ fontSize: 12, color: '#e8e0d0', marginTop: 6 }}>{c.name}</div>
              <div style={{ fontSize: 9, color: '#9a9080', fontStyle: 'italic', marginTop: 2 }}>{c.blurb}</div>
            </button>
          ))}
        </div>
        <button style={go} onClick={() => onPick(sel)}>wander</button>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: '#0a0a0e', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, fontFamily: '"Space Mono",monospace' } as const;
const panel = { textAlign: 'center', padding: 24 } as const;
const row = { display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' } as const;
const card = { background: '#16140f', border: '1px solid #2a2820', padding: '12px 14px', cursor: 'pointer', width: 120 } as const;
const cardSel = { borderColor: '#d4a437', boxShadow: '0 0 16px rgba(212,164,55,0.25)' } as const;
const go = { marginTop: 24, background: 'transparent', border: '1px solid #d4a437', color: '#d4a437', padding: '8px 30px', fontSize: 12, letterSpacing: '0.2em', cursor: 'pointer' } as const;
