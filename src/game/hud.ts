import portraitUrl from '../assets/art/barbarian/idle.png';
import { ITEMS, potionCap, type ItemDef } from './data/items';
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
  onAssign: ((id: string, slot: number) => void) | null = null;
  onAttribute: ((key: 'str' | 'dex' | 'vit' | 'energy') => void) | null = null;
  onPlay: (() => void) | null = null;
  onAgain: (() => void) | null = null;

  shopOpen = false;
  helpOpen = false;
  treeOpen = false;
  beltSlot = 0;
  pendingSkill: string | null = null;
  private built = false;
  private drag: { id: string; pointer: number; x: number; y: number; moved: boolean } | null = null;
  private ghost: HTMLElement | null = null;

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
      if (this.pendingSkill) {
        this.onAssign?.(this.pendingSkill, slot);
        this.pendingSkill = null;
        return;
      }
      if (skill.dataset.cast) this.onCast?.(skill.dataset.cast);
      else this.onOpenTree?.(slot);
    });
    this.ghost = document.createElement('div');
    this.ghost.id = 'drag-ghost';
    this.ghost.hidden = true;
    document.body.appendChild(this.ghost);
    window.addEventListener('pointermove', (event) => this.moveDrag(event));
    window.addEventListener('pointerup', (event) => this.endDrag(event));
    window.addEventListener('pointercancel', (event) => this.endDrag(event));
    this.root.querySelector('#tree')?.addEventListener('pointerdown', (event) => {
      const pointer = event as PointerEvent;
      const target = event.target as HTMLElement;
      const plus = target.closest<HTMLElement>('[data-upgrade]');
      if (plus?.dataset.upgrade) {
        event.preventDefault();
        event.stopPropagation();
        this.onUpgrade?.(plus.dataset.upgrade);
        return;
      }
      const attr = target.closest<HTMLElement>('[data-attr]');
      if (attr?.dataset.attr === 'str' || attr?.dataset.attr === 'dex' || attr?.dataset.attr === 'vit' || attr?.dataset.attr === 'energy') {
        event.preventDefault();
        this.onAttribute?.(attr.dataset.attr);
        return;
      }
      const slot = target.closest<HTMLElement>('[data-slot-pick]');
      if (slot?.dataset.slotPick) {
        event.preventDefault();
        const index = Number(slot.dataset.slotPick);
        if (this.pendingSkill) {
          this.onAssign?.(this.pendingSkill, index);
          this.pendingSkill = null;
        }
        return;
      }
      const row = target.closest<HTMLElement>('[data-skill]');
      if (!row?.dataset.skill) return;
      if (row.classList.contains('locked')) {
        this.onUpgrade?.(row.dataset.skill);
        return;
      }
      pointer.preventDefault();
      row.setPointerCapture(pointer.pointerId);
      this.drag = { id: row.dataset.skill, pointer: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, moved: false };
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
    const stats = `Str ${sim.attributes.str} · Dex ${sim.attributes.dex}. Potions ${potionCap(sim.loadout.belt)} each.`;
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
      const pts = sim.skillPoints + sim.statPoints;
      const touch = document.body.classList.contains('touch');
      treeBtn.textContent = pts > 0 ? `+${pts}` : touch ? 'Pts' : 'Points';
      treeBtn.classList.toggle('has-points', pts > 0);
    }
    if (!this.treeOpen) this.pendingSkill = null;
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
        : 'Bash starts on Q. Press T to spend points. Drag a skill onto the belt, or tap a skill and then a slot.',
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
      if (name) name.textContent = skill ? skill.short || skill.name : '+';
      button.title = skill?.description ?? 'Empty belt slot.';
      const rank = skill ? (sim.skillRanks[skill.id] ?? 0) : 0;
      const cd = skill ? (sim.cooldowns[skill.id] ?? 0) : 0;
      const cost = skill && rank > 0 ? manaCost(skill, rank) : 0;
      const dry = !!skill && rank > 0 && hero.mana < cost;
      button.classList.toggle('locked', !skill || rank <= 0);
      button.classList.toggle('nomana', dry);
      button.classList.toggle('ready', !!skill && rank > 0 && cd <= 0.05 && !dry);
      button.classList.toggle('arming', this.pendingSkill != null);
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
      const equippedId =
        item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt'
          ? sim.loadout[item.slot]
          : null;
      const previous = equippedId ? ITEMS.find((entry) => entry.id === equippedId) : undefined;
      const refund = previous && previous.id !== item.id ? Math.floor(previous.cost * 0.5) : 0;
      const price = Math.max(0, item.cost - refund);
      const broke = sim.gold < price;
      const needStr = (item.reqStr ?? 0) > sim.attributes.str;
      const needDex = (item.reqDex ?? 0) > sim.attributes.dex;
      const locked = (item.unlockLevel ?? 1) > sim.level;
      button.disabled = !near || owned || broke || needStr || needDex || locked;
      button.classList.toggle('owned', owned);
      const cost = button.querySelector('.item-cost');
      if (cost) {
        if (owned) cost.textContent = 'Owned';
        else if (locked) cost.textContent = `Lv ${item.unlockLevel}`;
        else if (needStr) cost.textContent = `Str ${item.reqStr}`;
        else if (needDex) cost.textContent = `Dex ${item.reqDex}`;
        else cost.textContent = refund > 0 ? `${price}g` : `${item.cost}g`;
      }
    }
  }

  private owned(sim: Sim, item: ItemDef): boolean {
    if (item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt') {
      return sim.loadout[item.slot] === item.id;
    }
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
    cols.innerHTML = sim.classDef.skills
      .map(
        (skill) => `
        <button type="button" class="tree-node" data-skill="${skill.id}" title="${skill.description.replace(/"/g, '&quot;')}">
          <span class="tn-name">${skill.name}</span>
          <span class="tn-meta" data-node-meta="${skill.id}"></span>
          <span class="plus" data-upgrade="${skill.id}" hidden>+</span>
        </button>`,
      )
      .join('');
  }

  private syncTree(sim: Sim): void {
    this.text(
      '#tree-points',
      `${sim.skillPoints} skill point${sim.skillPoints === 1 ? '' : 's'} · ${sim.statPoints} stat point${sim.statPoints === 1 ? '' : 's'} · potions ${potionCap(sim.loadout.belt)}`,
    );
    const pending = sim.classDef.skills.find((skill) => skill.id === this.pendingSkill);
    this.text(
      '#equip-hint',
      pending
        ? `${pending.name} selected. Tap Q W E R, or drag it onto a slot.`
        : 'Drag a skill onto a slot, or tap a skill and then a slot. New skills fill an empty slot.',
    );
    for (const key of ['str', 'dex', 'vit', 'energy'] as const) {
      const node = this.root.querySelector(`[data-attr-val="${key}"]`);
      const label = key === 'str' ? 'Str' : key === 'dex' ? 'Dex' : key === 'vit' ? 'Vit' : 'Energy';
      if (node) node.textContent = `${label} ${sim.attributes[key]}${sim.statPoints > 0 ? ' +' : ''}`;
    }
    const keys = ['Q', 'W', 'E', 'R'];
    sim.belt.forEach((id, slot) => {
      const name = this.root.querySelector(`[data-pick-name="${slot}"]`);
      const skill = sim.classDef.skills.find((entry) => entry.id === id);
      if (name) name.textContent = skill?.short ?? 'empty';
      const button = this.root.querySelector<HTMLButtonElement>(`[data-slot-pick="${slot}"]`);
      button?.classList.toggle('arming', this.pendingSkill != null);
      button?.classList.toggle('on', !!skill && skill.id === this.pendingSkill);
      if (button) button.setAttribute('aria-label', `${keys[slot]} ${skill?.name ?? 'empty'}`);
    });
    for (const skill of sim.classDef.skills) {
      const rank = sim.skillRanks[skill.id] ?? 0;
      const unlocked = sim.level >= skill.unlockLevel;
      const meta = this.root.querySelector(`[data-node-meta="${skill.id}"]`);
      const where = sim.belt.indexOf(skill.id);
      if (meta) {
        const place = where >= 0 ? ` · on ${keys[where]}` : '';
        meta.textContent = unlocked
          ? `${rank}/${skill.maxRank} · ${skill.mana} mana${place}`
          : `Locked until level ${skill.unlockLevel}`;
      }
      const node = this.root.querySelector<HTMLButtonElement>(`[data-skill="${skill.id}"]`);
      node?.classList.toggle('locked', !unlocked);
      node?.classList.toggle('on-belt', where >= 0);
      node?.classList.toggle('picked', this.pendingSkill === skill.id);
      const plus = node?.querySelector<HTMLElement>('[data-upgrade]');
      if (plus) plus.hidden = !(sim.skillPoints > 0 && unlocked && rank < skill.maxRank);
    }
  }

  private moveDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointer || !this.ghost) return;
    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    if (dx * dx + dy * dy > 64) this.drag.moved = true;
    if (!this.drag.moved) return;
    const skill = this.drag.id;
    const name = this.root.querySelector(`[data-skill="${skill}"] .tn-name`)?.textContent ?? skill;
    this.ghost.hidden = false;
    this.ghost.textContent = name;
    this.ghost.style.left = `${event.clientX}px`;
    this.ghost.style.top = `${event.clientY}px`;
  }

  private endDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    const drag = this.drag;
    this.drag = null;
    if (this.ghost) this.ghost.hidden = true;
    if (!drag.moved) {
      this.pendingSkill = this.pendingSkill === drag.id ? null : drag.id;
      return;
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const slotEl = hit?.closest<HTMLElement>('[data-slot], [data-slot-pick]');
    const raw = slotEl?.dataset.slot ?? slotEl?.dataset.slotPick;
    if (raw == null) return;
    this.onAssign?.(drag.id, Number(raw));
    this.pendingSkill = null;
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
