import portraitUrl from '../assets/art/barbarian/idle.png';
import { ITEMS, type ItemDef } from './data/items';
import { inShopRange, MAX_LEVEL, xpToNext } from './combat';
import { player } from './query';
import type { Sim } from './types';

type Mode = 'title' | 'play' | 'end';

export class Hud {
  onCast: ((id: string) => void) | null = null;
  onUpgrade: ((id: string) => void) | null = null;
  onBuy: ((id: string) => void) | null = null;
  onPotion: ((kind: 'health' | 'mana') => void) | null = null;
  onToggleShop: (() => void) | null = null;
  onToggleHelp: (() => void) | null = null;
  onToggleMute: (() => void) | null = null;
  onPlay: (() => void) | null = null;
  onAgain: (() => void) | null = null;

  shopOpen = false;
  helpOpen = false;
  private built = false;

  constructor(private root: HTMLElement) {}

  bind(): void {
    const portrait = this.root.querySelector<HTMLImageElement>('#portrait-img');
    if (portrait) portrait.src = portraitUrl;
    this.arm('#play-btn', () => this.onPlay?.());
    this.arm('#again-btn', () => this.onAgain?.());
    this.arm('#shop-btn', () => this.onToggleShop?.());
    this.arm('#help-btn', () => this.onToggleHelp?.());
    this.arm('#mute-btn', () => this.onToggleMute?.());
    this.arm('#shop-close', () => {
      this.shopOpen = false;
    });
    this.arm('#help-close', () => {
      this.helpOpen = false;
    });
    this.root.querySelector('#potion-hp')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.onPotion?.('health');
    });
    this.root.querySelector('#potion-mp')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.onPotion?.('mana');
    });
    this.root.querySelector('#skills')?.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      const plus = target.closest<HTMLElement>('[data-upgrade]');
      if (plus?.dataset.upgrade) {
        event.preventDefault();
        event.stopPropagation();
        this.onUpgrade?.(plus.dataset.upgrade);
        return;
      }
      const skill = target.closest<HTMLElement>('[data-cast]');
      if (skill?.dataset.cast) {
        event.preventDefault();
        this.onCast?.(skill.dataset.cast);
      }
    });
    this.root.querySelector('#shop-grid')?.addEventListener('pointerdown', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-buy]');
      if (!button?.dataset.buy) return;
      event.preventDefault();
      this.onBuy?.(button.dataset.buy);
    });
  }

  setMuteLabel(muted: boolean): void {
    const button = this.root.querySelector<HTMLButtonElement>('#mute-btn');
    if (button) button.textContent = muted ? 'Sound off' : 'Sound on';
  }

  sync(sim: Sim, mode: Mode): void {
    if (!this.built) {
      this.buildSkills(sim);
      this.buildShop();
      this.fillTitle(sim);
      this.built = true;
    }
    const title = this.q('#title');
    const hud = this.q('#hud');
    const end = this.q('#end');
    title.hidden = mode !== 'title';
    hud.hidden = mode !== 'play';
    end.hidden = mode !== 'end';
    if (mode === 'end') this.fillEnd(sim);
    if (mode !== 'play') return;

    const hero = player(sim);
    const hpPct = Math.max(0, hero.hp / hero.maxHp);
    const mpPct = hero.maxMana > 0 ? hero.mana / hero.maxMana : 0;
    const xpPct = sim.level >= MAX_LEVEL ? 1 : sim.xp / xpToNext(sim.level);
    this.setBar('#hp-fill', hpPct);
    this.setBar('#mp-fill', mpPct);
    this.setBar('#xp-fill', xpPct);
    this.text('#hp-text', `${Math.ceil(hero.hp)} / ${Math.ceil(hero.maxHp)}`);
    this.text('#mp-text', `${Math.ceil(hero.mana)} / ${Math.ceil(hero.maxMana)}`);
    this.text('#level', String(sim.level));
    this.text('#gold', String(Math.floor(sim.gold)));
    this.text('#cs', `${sim.cs} cs`);
    this.text('#kd', `${sim.kills} / ${sim.deaths}`);
    this.text('#clock', formatTime(sim.time));
    const names = [sim.loadout.weapon, sim.loadout.armor, sim.loadout.helm].filter(Boolean);
    this.text('#loadout', names.length ? names.map(labelOf).join(' · ') : 'Unarmed');

    const banner = this.q('#banner');
    if (sim.banner) {
      banner.hidden = false;
      banner.textContent = sim.banner.text;
    } else banner.hidden = true;
    const tip = this.q('#tip');
    if (sim.tip) {
      tip.hidden = false;
      tip.textContent = sim.tip;
    } else tip.hidden = true;

    const death = this.q('#death');
    if (!hero.alive) {
      death.hidden = false;
      death.textContent = `Slain — returning in ${Math.ceil(hero.respawn)}s`;
    } else death.hidden = true;

    const near = !hero.alive || inShopRange(sim, hero);
    const shop = this.q('#shop');
    shop.hidden = !this.shopOpen;
    shop.classList.toggle('far', !near);
    const note = this.q('#shop-note');
    note.textContent = near
      ? hero.alive
        ? 'Akara will trade while you stand in the Encampment.'
        : 'You may trade while you wait to return.'
      : 'Outside the Rogue Encampment. Walk back to camp — Akara will not sell out here.';
    const shopBtn = this.root.querySelector<HTMLButtonElement>('#shop-btn');
    if (shopBtn) shopBtn.textContent = near ? 'Shop' : 'Shop · camp';
    this.syncSkills(sim);
    this.syncShop(sim, near);
    this.text('#potion-hp-count', String(sim.potions.health));
    this.text('#potion-mp-count', String(sim.potions.mana));
    const help = this.q('#help');
    help.hidden = !this.helpOpen;
  }

  private fillTitle(sim: Sim): void {
    this.text('#title-class', sim.classDef.name);
    this.text('#title-blurb', sim.classDef.blurb);
    this.text('#title-act', `Act ${sim.map.actNumber} · ${sim.map.name}`);
    const list = sim.classDef.skills
      .map((skill) => `${skill.key} ${skill.name}`)
      .join('   ');
    this.text('#title-skills', list);
  }

  private fillEnd(sim: Sim): void {
    const won = sim.phase === 'victory';
    this.text('#end-title', won ? 'Victory' : 'Defeat');
    this.text(
      '#end-copy',
      won
        ? "Andariel's altar is silent. The road back to the Rogue Encampment is clear."
        : 'The Rogue Encampment has fallen. The Blood Moor belongs to the Fallen.',
    );
    this.text(
      '#end-stats',
      `Level ${sim.level}  ·  ${sim.kills} kills  ·  ${sim.deaths} deaths  ·  ${sim.cs} last hits  ·  ${formatTime(sim.time)}`,
    );
  }

  private buildSkills(sim: Sim): void {
    const host = this.root.querySelector('#skills');
    if (!host) return;
    host.innerHTML = '';
    for (const skill of sim.classDef.skills) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skill';
      button.dataset.cast = skill.id;
      button.innerHTML = `
        <span class="key">${skill.key}</span>
        <span class="sname">${skill.name}</span>
        <span class="rank" data-rank="${skill.id}"></span>
        <span class="cd" data-cd="${skill.id}"></span>
        <span class="plus" data-upgrade="${skill.id}" hidden>+</span>
      `;
      button.title = skill.description;
      button.addEventListener('pointerenter', () => {
        this.text('#skill-hint', skill.description);
      });
      host.appendChild(button);
    }
  }

  private syncSkills(sim: Sim): void {
    const hint = this.root.querySelector('#skill-hint');
    for (const skill of sim.classDef.skills) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-cast="${skill.id}"]`);
      if (!button) continue;
      const rank = sim.skillRanks[skill.id] ?? 0;
      const cd = sim.cooldowns[skill.id] ?? 0;
      const unlocked = sim.level >= skill.unlockLevel;
      const canLearn = sim.skillPoints > 0 && unlocked && rank < skill.maxRank;
      button.classList.toggle('locked', rank <= 0);
      button.classList.toggle('ready', rank <= 0 && canLearn);
      const rankEl = button.querySelector<HTMLElement>('[data-rank]');
      if (rankEl) {
        rankEl.innerHTML = Array.from({ length: skill.maxRank }, (_, index) =>
          `<i class="${index < rank ? 'on' : ''}"></i>`,
        ).join('');
      }
      const cdEl = button.querySelector<HTMLElement>('[data-cd]');
      if (cdEl) {
        if (cd > 0.05 && rank > 0) {
          cdEl.hidden = false;
          cdEl.textContent = String(Math.ceil(cd));
          button.style.setProperty('--cd', String(cd / skill.cooldown));
        } else {
          cdEl.hidden = true;
          button.style.setProperty('--cd', '0');
        }
      }
      const plus = button.querySelector<HTMLElement>('[data-upgrade]');
      if (plus) plus.hidden = !canLearn || rank <= 0;
      if (rank <= 0 && canLearn && hint && !hint.textContent) {
        hint.textContent = `${skill.name} can be learned.`;
      }
    }
  }

  private buildShop(): void {
    const host = this.root.querySelector('#shop-grid');
    if (!host) return;
    host.innerHTML = ITEMS.map(
      (item) => `
      <button type="button" class="item" data-buy="${item.id}">
        <span class="item-top"><span class="item-name">${item.name}</span><span class="item-cost">${item.cost}g</span></span>
        <span class="item-desc">${item.description}</span>
      </button>`,
    ).join('');
  }

  private syncShop(sim: Sim, near: boolean): void {
    for (const item of ITEMS) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-buy="${item.id}"]`);
      if (!button) continue;
      const owned = this.owned(sim, item);
      const broke = sim.gold < item.cost;
      button.disabled = !near || owned || broke;
      button.classList.toggle('owned', owned);
      const cost = button.querySelector('.item-cost');
      if (cost) cost.textContent = owned ? 'Owned' : `${item.cost}g`;
    }
  }

  private owned(sim: Sim, item: ItemDef): boolean {
    if (item.slot === 'weapon') return sim.loadout.weapon === item.id;
    if (item.slot === 'armor') return sim.loadout.armor === item.id;
    if (item.slot === 'helm') return sim.loadout.helm === item.id;
    return false;
  }

  private q(sel: string): HTMLElement {
    const node = this.root.querySelector<HTMLElement>(sel);
    if (!node) throw new Error(`Missing ${sel}`);
    return node;
  }

  private text(sel: string, value: string): void {
    const node = this.root.querySelector(sel);
    if (node) node.textContent = value;
  }

  private setBar(sel: string, pct: number): void {
    const node = this.root.querySelector<HTMLElement>(sel);
    if (!node) return;
    const clamped = Math.max(0, Math.min(1, pct));
    if (node.classList.contains('orb-liquid')) node.style.setProperty('--fill', String(clamped));
    else node.style.width = `${clamped * 100}%`;
  }

  /**
   * Phones often drop a click when the finger jitters, because touchmove is
   * cancelled on the page. Pointer capture + pointerup still fires. Click is
   * kept for keyboard activation and debounced so it cannot toggle twice.
   */
  private arm(selector: string, fn: () => void): void {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) return;
    let last = 0;
    const go = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - last < 450) return;
      last = now;
      fn();
    };
    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* element cannot capture */
      }
    });
    el.addEventListener('pointerup', go);
    el.addEventListener('click', go);
  }
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function labelOf(id: string | null): string {
  if (!id) return '';
  const item = ITEMS.find((entry) => entry.id === id);
  return item?.name ?? id;
}
