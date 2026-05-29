// src/App.tsx
import { useEffect, useState } from 'preact/hooks';
import { HUD } from './HUD';
import { Inventory } from './Inventory';
import { CharacterSelect } from './CharacterSelect';
import { Dpad } from './Dpad';
import { hudState, subscribe, closeCharacterSelect } from './game/hud-bus';
import type { Game } from './game/engine';

export function App({ game }: { game: Game }) {
  const [, force] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => subscribe(() => force(n => n + 1)), []);

  // Doug-only demo: no character gate — boot straight into the game loop.
  useEffect(() => {
    if (!started) { game.begin(); setStarted(true); }
  }, []);

  return (
    <>
      <HUD />
      <Inventory />
      <Dpad set={(dx, dy) => { game.input.touchDx = dx; game.input.touchDy = dy; }} onAction={() => game.input.onAction?.()} />
      <button
        onClick={() => game.input.onMute?.()}
        style={{
          position: 'fixed', top: 10, left: 12, zIndex: 20,
          background: 'rgba(0,0,0,0.45)', color: hudState.muted ? '#6a6358' : '#d4a437',
          border: '1px solid rgba(212,164,55,0.4)', borderRadius: 6,
          font: '10px "Space Mono", monospace', letterSpacing: '0.12em',
          padding: '4px 8px', cursor: 'pointer',
        }}
      >
        {hudState.muted ? 'sound: off' : 'sound: on'}
      </button>
    </>
  );
}
