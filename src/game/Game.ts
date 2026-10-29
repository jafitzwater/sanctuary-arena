import { sanctuary } from './data/acts/sanctuary';
import { getClass } from './data/classes';
import { playableIds } from './data/classes/roster';
import { AudioBus, registerAudioBus } from './audio';
import { damageUnit } from './combat';
import { player } from './query';
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
  private classId = 'barbarian';
  private mode: Mode = 'title';
  private last = 0;
  private time = 0;
  private renderer: Renderer;
  private input: InputController;
  private hud: Hud;
  private audio = new AudioBus();

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    registerAudioBus(this.audio);
    this.sim = createMatch(sanctuary, getClass(this.classId));
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
    this.hud.onPickClass = (id) => {
      if (!playableIds().includes(id)) return;
      this.classId = id;
      this.hud.markClass(id);
      // Amazon order: the title screen shows the picked class (name, blurb, skills).
      if (this.mode === 'title') this.sim = createMatch(sanctuary, getClass(id));
    };
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
    this.hud.onRecall = () => {
      this.input.recall = true;
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
    this.publishAimHook();
    this.publishAtmosHook();
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
    this.sim = createMatch(sanctuary, getClass(this.classId));
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
    // Doc: "The match cannot be paused." A touch menu only masks stray taps; the clock keeps running.
    const menuTouch = menu && document.body.classList.contains('touch');
    if (playing) {
      const raw = this.input.snapshot();
      const input = menuTouch
        ? { ...raw, moveX: 0, moveY: 0, attack: false, destX: null, destY: null, targetId: null, cast: null, potion: null }
        : raw;
      updateSim(this.sim, input, dt);
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
      autoTargetId: this.input.autoTargetId,
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

  private publishAtmosHook(): void {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('atmoslog') !== '1') return;
    const game = this;
    (globalThis as { __atmosCtl?: unknown }).__atmosCtl = {
      probe: () => game.renderer.debugAtmosphere(),
      sampleMap: (x: number, y: number) => game.renderer.sampleMap(x, y),
      sampleView: (x: number, y: number) => game.renderer.sampleView(x, y),
      setHitFlash() {
        player(game.sim).hitFlash = 0.12;
      },
      nearest() {
        return nearestMinion(game.sim);
      },
      killNearest() {
        const hero = player(game.sim);
        const spot = nearestMinion(game.sim);
        if (!spot) return null;
        const unit = game.sim.units.find((entry) => entry.id === spot.id);
        if (!unit) return null;
        damageUnit(game.sim, unit, unit.maxHp * 20 + 5000, hero);
        return spot;
      },
    };
  }

  private publishAimHook(): void {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('aimlog') !== '1') return;
    const game = this;
    (globalThis as { __aimSim?: unknown }).__aimSim = {
      setBelt(slot: number, id: string) {
        if (slot < 0 || slot > 3) return;
        game.sim.belt[slot] = id;
        game.sim.skillRanks[id] = Math.max(1, game.sim.skillRanks[id] ?? 0);
      },
      leap() {
        const hero = player(game.sim);
        return hero.leap ? { x0: hero.leap.x0, y0: hero.leap.y0, x1: hero.leap.x1, y1: hero.leap.y1 } : null;
      },
      stats() {
        const hero = player(game.sim);
        const enemy = game.sim.units.find((unit) => unit.id === game.sim.enemyChampionId);
        return {
          kills: game.sim.kills,
          deaths: game.sim.deaths,
          assists: game.sim.assists,
          allyKills: game.sim.allyKills,
          enemyKills: game.sim.enemyKills,
          heroLevel: hero.level,
          enemyLevel: enemy?.level ?? 0,
          kd: document.querySelector('#kd')?.textContent ?? '',
          score: document.querySelector('#score')?.textContent ?? '',
        };
      },
    };
  }
}

function nearestMinion(sim: Sim): { id: number; x: number; y: number } | null {
  const hero = player(sim);
  let best: { id: number; x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const unit of sim.units) {
    if (!unit.alive || unit.team === 'ally' || unit.kind !== 'minion') continue;
    const dist = Math.hypot(unit.x - hero.x, unit.y - hero.y);
    if (dist < bestD) {
      bestD = dist;
      best = { id: unit.id, x: unit.x, y: unit.y };
    }
  }
  return best;
}

function portrait(): boolean {
  return window.matchMedia('(orientation: portrait)').matches;
}
