import { render } from 'preact';
import { App } from './App';
import { startEngine } from './game/engine';

render(<App />, document.getElementById('root')!);
startEngine(document.getElementById('game') as HTMLCanvasElement);
