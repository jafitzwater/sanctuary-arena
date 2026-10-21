import './style.css';
import { armGestureAudio } from './game/audio';
import { Game } from './game/Game';
import { watchCanvasBacking } from './game/render';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const root = document.querySelector<HTMLElement>('#app');
if (!canvas || !root) {
  throw new Error('Sanctuary Arena failed to find its canvas');
}

watchCanvasBacking(canvas);
armGestureAudio();
const game = new Game(canvas, root);
game.start();
