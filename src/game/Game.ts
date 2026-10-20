import { sanctuary } from './data/acts/sanctuary';
import { barbarian } from './data/classes/barbarian';
import { AudioBus } from './audio';
import { Hud } from './hud';
import { InputController } from './input';
import { Renderer } from './render';
import { createMatch, updateSim } from './sim';
import type { Sim } from './types';

type Mode = 'title' | 'play' | 'end';

/**
 * Wires the simulator, the canvas, and the DOM HUD. New classes and acts are
 * chosen by passing a different ClassDef / ActDef into createMatch — the
 * default match is the Barbarian on Sanctuary.
 */
export class Game {
  private sim: Sim;
  private mode: Mode = 'title';
  private last = 0;
  private time = 0;
  private renderer: Renderer;
  private input: InputController;
  private hud: Hud;
  private audio = new AudioBus();

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.sim = createMatch(sanctuary, barbarian);
    this.renderer = new Renderer(canvas);
    this.hud = new Hud(root);
    this.input = new InputController(canvas, {
      getSim: () => this.sim,
      getWorld: (sx, sy) => this.renderer.screenToWorld(sx, sy),
      isPlaying: () => this.mode === 'play' && !portrait(),
      toggleShop: () => {
        this.hud.helpOpen = false;
        this.hud.treeOpen = false;
        this.hud.shopOpen = !this.hud.shopOpen;
      },
      toggleTree: () => {
        this.hud.shopOpen = false;
        this.hud.helpOpen = false;
        this.hud.treeOpen = !this.hud.treeOpen;
      },
      openTree: (slot) => {
        this.hud.beltSlot = slot;
        this.hud.shopOpen = false;
        this.hud.helpOpen = false;
        this.hud.treeOpen = true;
      },
      closeOverlays: () => {
        this.hud.shopOpen = false;
        this.hud.helpOpen = false;
        this.hud.treeOpen = false;
      },
    });
    this.hud.onPlay = () => this.begin();
    this.hud.onAgain = () => this.begin();
    this.hud.onCast = (id) => {
      this.audio.unlock();
      this.input.cast = id;
    };
    this.hud.onUpgrade = (id) => {
      this.input.upgrade = id;
    };
    this.hud.onBuy = (id) => {
      this.input.buy = id;
    };
    this.hud.onPotion = (kind) => {
      this.input.potion = kind;
    };
    this.hud.onToggleShop = () => {
      this.audio.unlock();
      this.hud.helpOpen = false;
      this.hud.treeOpen = false;
      this.hud.shopOpen = !this.hud.shopOpen;
    };
    this.hud.onToggleHelp = () => {
      this.hud.shopOpen = false;
      this.hud.treeOpen = false;
      this.hud.helpOpen = !this.hud.helpOpen;
    };
    this.hud.onToggleTree = () => {
      this.audio.unlock();
      this.hud.shopOpen = false;
      this.hud.helpOpen = false;
      this.hud.treeOpen = !this.hud.treeOpen;
    };
    this.hud.onOpenTree = (slot) => {
      this.hud.beltSlot = slot;
      this.hud.shopOpen = false;
      this.hud.helpOpen = false;
      this.hud.treeOpen = true;
    };
    this.hud.onAssign = (id, slot) => {
      this.input.assignSkill = id;
      this.input.assignSlot = slot;
    };
    this.hud.onAttribute = (key) => {
      this.input.attribute = key;
    };
    this.hud.onToggleMute = () => {
      const muted = this.audio.toggleMute();
      this.hud.setMuteLabel(muted);
    };
  }

  start(): void {
    this.hud.bind();
    this.hud.setMuteLabel(this.audio.muted);
    this.input.attach();
    this.syncTouchClass();
    window.addEventListener('resize', () => this.syncTouchClass());
    window.matchMedia('(pointer: coarse)').addEventListener('change', () => this.syncTouchClass());
    this.renderer.resize();
    this.renderer.updateCamera(this.sim, 'title', 0, 0);
    this.hud.sync(this.sim, this.mode);
    requestAnimationFrame(this.frame);
  }

  private begin(): void {
    this.audio.unlock();
    this.sim = createMatch(sanctuary, barbarian);
    this.mode = 'play';
    this.hud.shopOpen = false;
    this.hud.helpOpen = false;
    this.hud.treeOpen = false;
    this.input.targetId = null;
    this.input.dest = null;
    this.input.endFrame();
  }

  private frame = (now: number): void => {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.time += dt;
    this.renderer.resize();
    const playing = this.mode === 'play' && !portrait();
    const menu = this.hud.treeOpen || this.hud.shopOpen || this.hud.helpOpen;
    const paused = menu && document.body.classList.contains('touch');
    if (playing) {
      const raw = this.input.snapshot();
      const input = paused
        ? { ...raw, moveX: 0, moveY: 0, attack: false, destX: null, destY: null, targetId: null, cast: null, potion: null }
        : raw;
      updateSim(this.sim, input, paused ? 0 : dt);
      if (this.sim.phase !== 'playing') {
        this.mode = 'end';
        this.hud.shopOpen = false;
        this.hud.helpOpen = false;
        this.hud.treeOpen = false;
      }
    }
    this.input.endFrame();
    this.audio.consume(this.sim);
    this.renderer.updateCamera(this.sim, this.mode === 'end' ? 'play' : this.mode, dt, this.time);
    this.renderer.draw(this.sim, {
      mode: this.mode,
      targetId: this.input.targetId,
      attack: this.input.attack,
      time: this.time,
    });
    this.hud.sync(this.sim, this.mode, playing ? this.input.targetId : null);
    requestAnimationFrame(this.frame);
  };

  private syncTouchClass(): void {
    // Phones report a coarse pointer. A short landscape window also gets the
    // stick so a phone-sized browser (including responsive mode that still
    // reports a fine pointer) is playable. Hover-none alone is not enough:
    // some desktop and headless browsers report it without being touch devices.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const phoneLandscape =
      window.innerWidth <= 1024 &&
      window.innerHeight <= 540 &&
      window.innerWidth > window.innerHeight;
    document.body.classList.toggle('touch', coarse || phoneLandscape);
    this.hud.setMuteLabel(this.audio.muted);
  }
}

function portrait(): boolean {
  return window.matchMedia('(orientation: portrait)').matches;
}
