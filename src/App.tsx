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

  // returning players (have a save) skip straight in; first-timers see the gate
  useEffect(() => {
    if (game.hasSave && !started) { game.begin(); setStarted(true); }
  }, []);

  const showGate = (!started && !game.hasSave) || hudState.characterSelectOpen;

  return (
    <>
      <HUD />
      <Inventory />
      <Dpad set={(dx, dy) => { game.input.touchDx = dx; game.input.touchDy = dy; }} onAction={() => game.input.onAction?.()} />
      {showGate && (
        <CharacterSelect
          current={hudState.character}
          onPick={(id) => {
            game.setCharacter(id);
            if (hudState.characterSelectOpen) closeCharacterSelect();
            if (!started) { game.begin(); setStarted(true); }
          }}
        />
      )}
    </>
  );
}
