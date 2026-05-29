import { render } from 'preact';
import { App } from './App';
import { startEngine } from './game/engine';

const game = startEngine(document.getElementById('game') as HTMLCanvasElement);
render(<App game={game} />, document.getElementById('root')!);
