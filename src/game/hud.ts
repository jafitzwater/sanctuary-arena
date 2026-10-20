import portraitUrl from '../assets/art/barbarian/idle.png';
import { ITEMS, type ItemDef } from './data/items';
import { inShopRange, manaCost, MAX_LEVEL, xpToNext } from './combat';
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
  onToggleTree: (() => void) | null = null;
  onOpenTree: ((slot: number) => void) | null = null;
  onAssign: ((id: string) => void) | null = null;
  onAttribute: ((key: 'str' | 'dex' | 'vit' | 'energy') => void) | null = null;
  onPlay: (() => void) | null = null;
  onAgain: (() => void) | null = null;

  shopOpen = false;
  helpOpen = false;
  treeOpen = false;
  beltSlot = 0;
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
    this.arm('#tree-btn', () => this.onToggleTree?.());
    this.arm('#tree-close', () => {
      this.treeOpen = false;
    });
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
      if (!skill) return;
      event.preventDefault();
      const slot = Number(skill.dataset.slot ?? 0);
      this.beltSlot = slot;
      if (skill.dataset.cast) this.onCast?.(skill.dataset.cast);
      else this.onOpenTree?.(slot);
    });
    this.root.querySelector('#tree')?.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      const attr = target.closest<HTMLElement>('[data-attr]');
      if (attr?.dataset.attr === 'str' || attr?.dataset.attr === 'dex' || attr?.dataset.attr === 'vit' || attr?.dataset.attr === 'energy') {
        event.preventDefault();
        this.onAttribute?.(attr.dataset.attr);
        return;
      }
      const slot = target.closest<HTMLElement>('[data-slot-pick]');
      if (slot?.dataset.slotPick) {
        event.preventDefault();
        this.beltSlot = Number(slot.dataset.slotPick);
        return;
      }
      const plus = target.closest<HTMLElement>('[data-upgrade]');
      if (plus?.dataset.upgrade) {
        event.preventDefault();
        event.stopPropagation();
        this.onUpgrade?.(plus.dataset.upgrade);
        return;
      }
      const node = target.closest<HTMLElement>('[data-assign]');
      if (node?.dataset.assign) {
        event.preventDefault();
        this.onAssign?.(node.dataset.assign);
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
    if (!button) return;
    const touch = document.body.classList.contains('touch');
    button.textContent = muted ? (touch ? 'Muted' : 'Sound off') : touch ? 'Sound' : 'Sound on';
  }

  sync(sim: Sim, mode: Mode, focusId: number | null = null): void {
    if (!this.built) {
      this.buildSkills(sim);
      this.buildShop();
      this.buildTree(sim);
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
    this.setBar('#hp-bar', hpPct);
    this.setBar('#mp-bar', mpPct);
    this.setBar('#xp-fill', xpPct);
    const hpLabel = `${Math.ceil(hero.hp)} / ${Math.ceil(hero.maxHp)}`;
    const mpLabel = `${Math.ceil(hero.mana)} / ${Math.ceil(hero.maxMana)}`;
    this.text('#hp-text', hpLabel);
    this.text('#mp-text', mpLabel);
    this.text('#hp-compact', hpLabel);
    this.text('#mp-compact', mpLabel);
    this.text('#level', String(sim.level));
    this.text('#gold', String(Math.floor(sim.gold)));
    this.text('#cs', `${sim.cs} cs`);
    this.text('#kd', `${sim.kills} / ${sim.deaths}`);
    this.text('#clock', formatTime(sim.time));
    const names = [sim.loadout.weapon, sim.loadout.offhand, sim.loadout.armor, sim.loadout.helm, sim.loadout.belt].filter(Boolean);
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
    const stats = `Str ${sim.attributes.str} · Dex ${sim.attributes.dex}.`;
    note.textContent = near
      ? hero.alive
        ? `Akara will trade while you stand in the Encampment. ${stats}`
        : `You may trade while you wait to return. ${stats}`
      : `Outside the Rogue Encampment. Walk back to camp — Akara will not sell out here. ${stats}`;
    const shopBtn = this.root.querySelector<HTMLButtonElement>('#shop-btn');
    if (shopBtn) {
      const touch = document.body.classList.contains('touch');
      shopBtn.textContent = near ? 'Shop' : touch ? 'Camp' : 'Shop · camp';
    }
    this.syncTarget(sim, focusId);
    this.syncSkills(sim);
    this.syncShop(sim, near);
    this.text('#potion-hp-count', String(sim.potions.health));
    this.text('#potion-mp-count', String(sim.potions.mana));
    const help = this.q('#help');
    help.hidden = !this.helpOpen;
    const tree = this.q('#tree');
    tree.hidden = !this.treeOpen;
    const treeBtn = this.root.querySelector<HTMLButtonElement>('#tree-btn');
    if (treeBtn) {
      treeBtn.textContent = 'Tree';
      treeBtn.classList.toggle('has-points', sim.skillPoints > 0 || sim.statPoints > 0);
    }
    this.syncTree(sim);
  }

  private fillTitle(sim: Sim): void {
    this.text('#title-class', sim.classDef.name);
    this.text('#title-blurb', sim.classDef.blurb);
    this.text('#title-act', `Act ${sim.map.actNumber} · ${sim.map.name}`);
    const keyed = sim.classDef.skills.filter((skill) => skill.key);
    this.text(
      '#title-skills',
      keyed.length
        ? keyed.map((skill) => `${skill.key} ${skill.name}`).join('   ')
        : 'Bash starts on Q. Press T for the skill tree and put four skills on the belt.',
    );
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
    const keys = ['Q', 'W', 'E', 'R'];
    for (let slot = 0; slot < 4; slot++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skill';
      button.dataset.slot = String(slot);
      button.innerHTML = `
        <span class="sweep" data-sweep="${slot}"></span>
        <span class="key">${keys[slot]}</span>
        <span class="sname" data-sname="${slot}"></span>
        <span class="rank" data-rank="${slot}"></span>
        <span class="cd" data-cd="${slot}" hidden></span>
        <span class="plus" data-upgrade="" hidden>+</span>
      `;
      button.addEventListener('pointerenter', () => {
        const id = sim.belt[slot];
        const skill = sim.classDef.skills.find((entry) => entry.id === id);
        this.text('#skill-hint', skill ? skill.description : 'Empty belt slot. Open the tree to assign a skill.');
      });
      host.appendChild(button);
    }
  }

  private syncSkills(sim: Sim): void {
    const keys = ['Q', 'W', 'E', 'R'];
    const hero = player(sim);
    sim.belt.forEach((id, slot) => {
      const button = this.root.querySelector<HTMLButtonElement>(`#skills [data-slot="${slot}"]`);
      if (!button) return;
      const skill = sim.classDef.skills.find((entry) => entry.id === id);
      button.dataset.cast = id;
      const name = button.querySelector('[data-sname]');
      if (name) name.textContent = skill ? skill.name : '+';
      button.title = skill?.description ?? 'Empty belt slot. Open the tree to assign a skill.';
      const rank = skill ? (sim.skillRanks[skill.id] ?? 0) : 0;
      const cd = skill ? (sim.cooldowns[skill.id] ?? 0) : 0;
      const cost = skill && rank > 0 ? manaCost(skill, rank) : 0;
      const dry = !!skill && rank > 0 && hero.mana < cost;
      button.classList.toggle('locked', !skill || rank <= 0);
      button.classList.toggle('nomana', dry);
      button.classList.toggle('ready', !!skill && rank > 0 && cd <= 0.05 && !dry);
      const rankEl = button.querySelector<HTMLElement>('[data-rank]');
      if (rankEl) rankEl.textContent = skill && rank > 0 ? String(rank) : '';
      const cdEl = button.querySelector<HTMLElement>('[data-cd]');
      const fraction = skill && cd > 0.05 && rank > 0 ? cd / Math.max(0.1, skill.cooldown) : 0;
      button.style.setProperty('--cd', String(fraction));
      if (cdEl) {
        if (fraction > 0) {
          cdEl.hidden = false;
          cdEl.textContent = String(Math.ceil(cd));
        } else cdEl.hidden = true;
      }
      const plus = button.querySelector<HTMLElement>('[data-upgrade]');
      const canLearn = !!skill && sim.skillPoints > 0 && sim.level >= skill.unlockLevel && rank > 0 && rank < skill.maxRank;
      if (plus) {
        plus.hidden = !canLearn;
        plus.dataset.upgrade = skill && canLearn ? skill.id : '';
      }
      const manaNote = dry ? `, need ${cost} mana` : '';
      button.setAttribute('aria-label', skill ? `${keys[slot]} ${skill.name}${manaNote}` : `${keys[slot]} empty`);
    });
  }

  private syncTarget(sim: Sim, focusId: number | null): void {
    const bar = this.root.querySelector<HTMLElement>('#targetbar');
    if (!bar) return;
    const hero = player(sim);
    const id = focusId ?? hero.targetId;
    const unit = sim.units.find((entry) => entry.id === id && entry.alive && entry.team !== 'ally');
    if (!unit || unit.maxHp <= 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    this.text('#target-name', unit.name);
    this.setBar('#target-fill', unit.hp / unit.maxHp);
  }

  private buildShop(): void {
    const host = this.root.querySelector('#shop-grid');
    if (!host) return;
    const groups: { title: string; slot: ItemDef['slot'] }[] = [
      { title: 'Potions', slot: 'consumable' },
      { title: 'Weapons', slot: 'weapon' },
      { title: 'Armor', slot: 'armor' },
      { title: 'Helms', slot: 'helm' },
      { title: 'Belts', slot: 'belt' },
      { title: 'Shields', slot: 'shield' },
    ];
    host.innerHTML = groups
      .map((group) => {
        const items = ITEMS.filter((item) => item.slot === group.slot);
        if (!items.length) return '';
        return `<h3 class="shop-h">${group.title}</h3>${items
          .map(
            (item) => `
      <button type="button" class="item" data-buy="${item.id}">
        <span class="item-top"><span class="item-name">${item.name}</span><span class="item-cost">${item.cost}g</span></span>
        <span class="item-desc">${item.description}</span>
      </button>`,
          )
          .join('')}`;
      })
      .join('');
  }

  private syncShop(sim: Sim, near: boolean): void {
    for (const item of ITEMS) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-buy="${item.id}"]`);
      if (!button) continue;
      const owned = this.owned(sim, item);
      const broke = sim.gold < item.cost;
      const needStr = (item.reqStr ?? 0) > sim.attributes.str;
      const needDex = (item.reqDex ?? 0) > sim.attributes.dex;
      button.disabled = !near || owned || broke || needStr || needDex;
      button.classList.toggle('owned', owned);
      const cost = button.querySelector('.item-cost');
      if (cost) {
        if (owned) cost.textContent = 'Owned';
        else if (needStr) cost.textContent = `Str ${item.reqStr}`;
        else if (needDex) cost.textContent = `Dex ${item.reqDex}`;
        else cost.textContent = `${item.cost}g`;
      }
    }
  }

  private owned(sim: Sim, item: ItemDef): boolean {
    if (item.slot === 'weapon') return !!item.twoHanded && !item.oneOrTwo && sim.loadout.weapon === item.id;
    if (item.slot === 'shield') return sim.loadout.offhand === item.id;
    if (item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt') return sim.loadout[item.slot] === item.id;
    return false;
  }

  private buildTree(sim: Sim): void {
    const attrs = this.root.querySelector('#attr-row');
    const picks = this.root.querySelector('#belt-pick');
    const cols = this.root.querySelector('#tree-cols');
    if (!attrs || !picks || !cols) return;
    const keys = ['str', 'dex', 'vit', 'energy'] as const;
    const labels = { str: 'Str', dex: 'Dex', vit: 'Vit', energy: 'Energy' };
    attrs.innerHTML = keys
      .map((key) => `<button type="button" data-attr="${key}"><b data-attr-val="${key}">${labels[key]}</b></button>`)
      .join('');
    picks.innerHTML = ['Q', 'W', 'E', 'R']
      .map((key, index) => `<button type="button" data-slot-pick="${index}">${key} <span data-pick-name="${index}"></span></button>`)
      .join('');
    const tabs = [1, 2, 3];
    cols.innerHTML = tabs
      .map((tab) => {
        const skills = sim.classDef.skills
          .filter((skill) => skill.tab === tab)
          .sort((a, b) => a.row - b.row || a.col - b.col);
        const title = skills[0]?.tabName ?? 'Skills';
        const nodes = skills
          .map(
            (skill) => `
          <button type="button" class="tree-node" data-assign="${skill.id}" title="${skill.description.replace(/"/g, '&quot;')}">
            <span class="tn-name">${skill.name}</span>
            <span class="tn-meta" data-node-meta="${skill.id}"></span>
            <span class="plus" data-upgrade="${skill.id}" hidden>+</span>
          </button>`,
          )
          .join('');
        return `<div class="tree-col"><h3>${title}</h3>${nodes}</div>`;
      })
      .join('');
  }

  private syncTree(sim: Sim): void {
    this.text(
      '#tree-points',
      `${sim.skillPoints} skill point${sim.skillPoints === 1 ? '' : 's'} · ${sim.statPoints} stat point${sim.statPoints === 1 ? '' : 's'}`,
    );
    for (const key of ['str', 'dex', 'vit', 'energy'] as const) {
      const node = this.root.querySelector(`[data-attr-val="${key}"]`);
      const label = key === 'str' ? 'Str' : key === 'dex' ? 'Dex' : key === 'vit' ? 'Vit' : 'Energy';
      if (node) node.textContent = `${label} ${sim.attributes[key]}${sim.statPoints > 0 ? ' +' : ''}`;
    }
    sim.belt.forEach((id, slot) => {
      const name = this.root.querySelector(`[data-pick-name="${slot}"]`);
      const skill = sim.classDef.skills.find((entry) => entry.id === id);
      if (name) name.textContent = skill?.name ?? 'empty';
      const button = this.root.querySelector<HTMLButtonElement>(`[data-slot-pick="${slot}"]`);
      button?.classList.toggle('on', slot === this.beltSlot);
    });
    for (const skill of sim.classDef.skills) {
      const rank = sim.skillRanks[skill.id] ?? 0;
      const meta = this.root.querySelector(`[data-node-meta="${skill.id}"]`);
      const ready = sim.level >= skill.unlockLevel && skill.prereqs.every((req) => (sim.skillRanks[req] ?? 0) >= 1);
      if (meta) {
        const mana = skill.passive ? 'passive' : `${skill.mana} mana`;
        meta.textContent = `${rank}/${skill.maxRank} · lv ${skill.unlockLevel} · ${mana}${ready ? '' : ' · locked'}`;
      }
      const node = this.root.querySelector<HTMLButtonElement>(`[data-assign="${skill.id}"]`);
      node?.classList.toggle('locked', !ready && rank <= 0);
      node?.classList.toggle('on-belt', sim.belt.includes(skill.id));
      const plus = node?.querySelector<HTMLElement>('[data-upgrade]');
      if (plus) plus.hidden = !(sim.skillPoints > 0 && ready && rank < skill.maxRank);
    }
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
