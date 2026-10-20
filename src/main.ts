import './style.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const root = document.querySelector<HTMLElement>('#app');
if (!canvas || !root) {
  throw new Error('Sanctuary Arena failed to find its canvas');
}

const game = new Game(canvas, root);
game.start();
