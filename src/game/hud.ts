import portraitUrl from '../assets/art/barbarian/idle.png';
import { itemIcon, skillIcon } from './art/icons';
import { ITEMS, potionCap, type ItemDef } from './data/items';
import { inShopRange, manaCost, MAX_LEVEL, xpToNext } from './combat';
import { player } from './query';
import type { Sim } from './types';

type MenuTab = 'skills' | 'stats';
type ShopCat = 'recommended' | 'consumable' | 'weapon' | 'armor' | 'helm' | 'belt';

const GEAR_PATHS: { slot: 'weapon' | 'armor' | 'helm' | 'belt'; ids: string[] }[] = [
  { slot: 'weapon', ids: ['clb', 'ssd', 'flc', '2hs'] },
  { slot: 'armor', ids: ['qui', 'lea', 'stu', 'rng'] },
  { slot: 'helm', ids: ['cap', 'skp', 'hlm', 'fhl'] },
  { slot: 'belt', ids: ['lbl', 'mbl'] },
];

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
  tab: MenuTab = 'stats';
  beltSlot = 0;
  pendingSkill: string | null = null;
  private built = false;
  private sawTree = false;
  private sawShop = false;
  private shopCat: ShopCat = 'recommended';
  private shopPick: string | null = null;
  private quickId: string | null = null;
  private shopGridKey = '';
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
    this.arm('#shop-buy', () => {
      if (this.shopPick) this.onBuy?.(this.shopPick);
    });
    this.arm('#quick-buy', () => {
      if (this.quickId) this.onBuy?.(this.quickId);
    });
    for (const id of ['skills', 'stats'] as const) {
      this.arm(`#tab-${id}`, () => {
        this.tab = id;
      });
    }
    this.root.querySelector('#shop')?.addEventListener('pointerdown', (event) => {
      if (event.target === event.currentTarget) this.shopOpen = false;
    });
    this.root.querySelector('#tree')?.addEventListener('pointerdown', (event) => {
      if (event.target === event.currentTarget) this.treeOpen = false;
    });
    this.tap(this.root.querySelector('#shop-cats'), '[data-cat]', (button) => {
      const cat = button.dataset.cat;
      if (cat === 'recommended' || cat === 'consumable' || cat === 'weapon' || cat === 'armor' || cat === 'helm' || cat === 'belt') {
        this.shopCat = cat;
      }
    });
    this.tap(this.root.querySelector('#shop-grid'), '[data-pick]', (button) => {
      if (button.dataset.pick) this.shopPick = button.dataset.pick;
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
      if (row.classList.contains('locked') || row.classList.contains('unlearned')) {
        if (row.classList.contains('unlearned') && !row.classList.contains('locked')) this.onUpgrade?.(row.dataset.skill);
        return;
      }
      // Leave the pointer with the scroller until the gesture is clearly a sideways drag.
      this.drag = { id: row.dataset.skill, pointer: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, moved: false };
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
    const shopJust = this.shopOpen && !this.sawShop;
    if (this.treeOpen && !this.sawTree) this.tab = sim.statPoints > 0 ? 'stats' : 'skills';
    this.sawShop = this.shopOpen;
    this.sawTree = this.treeOpen;
    const note = this.q('#shop-note');
    const stats = `Str ${sim.attributes.str} · Dex ${sim.attributes.dex} · potions ${potionCap(sim.loadout.belt)}`;
    note.textContent = near
      ? hero.alive
        ? `In camp. A new piece replaces the old one. ${stats}`
        : `You can trade while you wait to return. ${stats}`
      : `Outside camp. Walk back before Akara will sell. ${stats}`;
    const shopBtn = this.root.querySelector<HTMLButtonElement>('#shop-btn');
    if (shopBtn) {
      const touch = document.body.classList.contains('touch');
      shopBtn.textContent = near ? 'Shop' : touch ? 'Camp' : 'Shop · camp';
    }
    this.syncTarget(sim, focusId);
    this.syncSkills(sim);
    this.syncShop(sim, near, shopJust);
    this.text('#potion-hp-count', String(sim.potions.health));
    this.text('#potion-mp-count', String(sim.potions.mana));
    const help = this.q('#help');
    help.hidden = !this.helpOpen;
    const tree = this.q('#tree');
    tree.hidden = !this.treeOpen;
    const shop = this.q('#shop');
    shop.hidden = !this.shopOpen;
    shop.classList.toggle('far', this.shopOpen && !near);
    for (const id of ['skills', 'stats'] as const) {
      this.root.querySelector(`#tab-${id}`)?.classList.toggle('on', this.tab === id);
      this.root.querySelector(`#tab-${id}`)?.setAttribute('aria-selected', this.tab === id ? 'true' : 'false');
      const pane = this.root.querySelector<HTMLElement>(`#pane-${id}`);
      if (pane) pane.hidden = this.tab !== id;
    }
    const heading = this.root.querySelector('#tree-heading');
    if (heading) heading.textContent = this.tab === 'stats' ? 'Stats' : 'Loadout';
    const treeBtn = this.root.querySelector<HTMLButtonElement>('#tree-btn');
    if (treeBtn) {
      const pts = sim.skillPoints + sim.statPoints;
      const touch = document.body.classList.contains('touch');
      treeBtn.textContent = pts > 0 ? `+${pts}` : touch ? 'Pts' : 'Points';
      treeBtn.classList.toggle('has-points', pts > 0);
    }
    if (!this.treeOpen || this.tab !== 'skills') this.pendingSkill = null;
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
        : 'Bash starts on Q. Press T to spend points. Learn a skill before it can go on the belt.',
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
        <img class="sicon" alt="" data-sicon="${slot}" hidden />
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
      const icon = button.querySelector<HTMLImageElement>('[data-sicon]');
      if (icon) {
        const src = skill ? skillIcon(skill.id) : '';
        icon.hidden = !src;
        if (src) icon.src = src;
      }
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
      const canLearn = !!skill && sim.skillPoints > 0 && sim.level >= skill.unlockLevel && rank < skill.maxRank;
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
    const cats = this.root.querySelector('#shop-cats');
    if (!cats) return;
    const labels: { id: ShopCat; label: string }[] = [
      { id: 'recommended', label: 'Recommended' },
      { id: 'consumable', label: 'Potions' },
      { id: 'weapon', label: 'Weapons' },
      { id: 'armor', label: 'Armor' },
      { id: 'helm', label: 'Helms' },
      { id: 'belt', label: 'Belts' },
    ];
    cats.innerHTML = labels
      .map((cat) => `<button type="button" data-cat="${cat.id}" role="tab">${cat.label}</button>`)
      .join('');
  }

  private syncShop(sim: Sim, near: boolean, justOpened: boolean): void {
    const recommended = this.recommended(sim);
    const ready = recommended.find((item) => this.affordable(this.quote(sim, item), near));
    const fallback = recommended.find((item) => !item.consumable) ?? recommended[0] ?? null;
    const quick = ready ?? fallback;
    this.quickId = quick?.id ?? null;
    this.paintQuick(sim, quick, near);
    if (justOpened) {
      this.shopCat = 'recommended';
      this.shopPick = quick?.id ?? null;
      this.shopGridKey = '';
    }
    const list = this.shopCat === 'recommended' ? recommended : ITEMS.filter((item) => item.slot === this.shopCat);
    if (!list.some((item) => item.id === this.shopPick)) this.shopPick = list[0]?.id ?? null;
    const key = `${this.shopCat}:${list.map((item) => item.id).join(',')}`;
    const host = this.root.querySelector('#shop-grid');
    if (host && key !== this.shopGridKey) {
      this.shopGridKey = key;
      host.innerHTML = list.length
        ? list
            .map(
              (item) => `
        <button type="button" class="shop-icon" data-pick="${item.id}" aria-label="${item.name}">
          <img alt="" src="${itemIcon(item.id)}" />
          <small></small>
        </button>`,
            )
            .join('')
        : '<p class="shop-empty">Nothing else to buy.</p>';
      host.scrollTop = 0;
    }
    this.root.querySelectorAll<HTMLButtonElement>('#shop-cats button').forEach((button) => {
      const on = button.dataset.cat === this.shopCat;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    host?.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((button) => {
      const item = ITEMS.find((entry) => entry.id === button.dataset.pick);
      if (!item) return;
      const quote = this.quote(sim, item);
      button.classList.toggle('on', item.id === this.shopPick);
      button.classList.toggle('owned', quote.owned);
      const price = button.querySelector('small');
      if (price) price.textContent = this.shortPrice(item, quote);
    });
    const pick = list.find((item) => item.id === this.shopPick) ?? null;
    const icon = this.root.querySelector<HTMLImageElement>('#shop-detail-icon');
    if (icon) {
      icon.hidden = !pick;
      if (pick) icon.src = itemIcon(pick.id);
    }
    this.text('#shop-detail-name', pick?.name ?? 'Akara');
    this.text('#shop-detail-desc', pick?.description ?? 'Stand in the Encampment and pick a category.');
    const quote = pick ? this.quote(sim, pick) : null;
    const bits = pick && quote
      ? [
          pick.reqStr ? `Str ${pick.reqStr}` : '',
          pick.reqDex ? `Dex ${pick.reqDex}` : '',
          (pick.unlockLevel ?? 1) > 1 ? `Level ${pick.unlockLevel}` : '',
          quote.owned ? 'Equipped' : `${quote.price} gold`,
        ].filter(Boolean)
      : [];
    this.text('#shop-detail-meta', bits.join(' · '));
    const buy = this.root.querySelector<HTMLButtonElement>('#shop-buy');
    if (buy) {
      const ok = !!pick && !!quote && this.affordable(quote, near);
      buy.disabled = !ok;
      buy.textContent = pick && quote ? this.buyLabel(pick, quote, near) : 'Buy';
    }
  }

  private paintQuick(sim: Sim, item: ItemDef | null, near: boolean): void {
    const chip = this.root.querySelector<HTMLButtonElement>('#quick-buy');
    if (!chip) return;
    if (!item) {
      chip.hidden = true;
      return;
    }
    const quote = this.quote(sim, item);
    const ok = this.affordable(quote, near);
    chip.hidden = false;
    chip.disabled = !ok;
    chip.classList.toggle('ready', ok);
    const icon = chip.querySelector('img');
    if (icon) icon.src = itemIcon(item.id);
    const cost = chip.querySelector('b');
    if (cost) cost.textContent = ok ? `${quote.price}g` : this.shortPrice(item, quote);
    chip.setAttribute('aria-label', ok ? `Buy ${item.name} for ${quote.price} gold` : `${item.name}, ${this.buyLabel(item, quote, near)}`);
  }

  private recommended(sim: Sim): ItemDef[] {
    const gear: ItemDef[] = [];
    for (const path of GEAR_PATHS) {
      const owned = sim.loadout[path.slot];
      const index = owned ? path.ids.indexOf(owned) : -1;
      const next = ITEMS.find((item) => item.id === path.ids[index + 1]);
      if (!next || (next.unlockLevel ?? 1) > sim.level) continue;
      gear.push(next);
    }
    const cap = potionCap(sim.loadout.belt);
    const pots = ITEMS.filter((item) => !!item.consumable && sim.potions[item.consumable!] < cap);
    return [...gear, ...pots];
  }

  private quote(sim: Sim, item: ItemDef): { price: number; owned: boolean; broke: boolean; needStr: boolean; needDex: boolean; locked: boolean; full: boolean } {
    const owned = this.owned(sim, item);
    const equippedId =
      item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt' ? sim.loadout[item.slot] : null;
    const previous = equippedId ? ITEMS.find((entry) => entry.id === equippedId) : undefined;
    const refund = previous && previous.id !== item.id ? Math.floor(previous.cost * 0.5) : 0;
    const price = item.consumable ? item.cost : Math.max(0, item.cost - refund);
    return {
      price,
      owned,
      broke: sim.gold < price,
      needStr: (item.reqStr ?? 0) > sim.attributes.str,
      needDex: (item.reqDex ?? 0) > sim.attributes.dex,
      locked: (item.unlockLevel ?? 1) > sim.level,
      full: item.consumable ? sim.potions[item.consumable] >= potionCap(sim.loadout.belt) : false,
    };
  }

  private affordable(quote: { owned: boolean; broke: boolean; needStr: boolean; needDex: boolean; locked: boolean; full: boolean }, near: boolean): boolean {
    return near && !quote.owned && !quote.broke && !quote.needStr && !quote.needDex && !quote.locked && !quote.full;
  }

  private buyLabel(item: ItemDef, quote: { price: number; owned: boolean; broke: boolean; needStr: boolean; needDex: boolean; locked: boolean; full: boolean }, near: boolean): string {
    if (quote.owned) return 'Owned';
    if (quote.locked) return `Lv ${item.unlockLevel}`;
    if (quote.needStr) return `Str ${item.reqStr}`;
    if (quote.needDex) return `Dex ${item.reqDex}`;
    if (quote.full) return 'Full';
    if (!near) return 'Camp';
    return `Buy ${quote.price}g`;
  }

  private shortPrice(item: ItemDef, quote: { price: number; owned: boolean; needStr: boolean; needDex: boolean; locked: boolean; full: boolean }): string {
    if (quote.owned) return 'Have';
    if (quote.locked) return `Lv ${item.unlockLevel}`;
    if (quote.needStr) return `Str ${item.reqStr}`;
    if (quote.needDex) return `Dex ${item.reqDex}`;
    if (quote.full) return 'Full';
    return `${quote.price}g`;
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
    const long = { str: 'Strength', dex: 'Dexterity', vit: 'Vitality', energy: 'Energy' };
    attrs.innerHTML = keys
      .map(
        (key) =>
          `<button type="button" data-attr="${key}"><span class="attr-copy"><b>${long[key]}</b><span data-attr-val="${key}">0</span></span><span class="spend">+</span></button>`,
      )
      .join('');
    picks.innerHTML = ['Q', 'W', 'E', 'R']
      .map((key, index) => `<button type="button" data-slot-pick="${index}">${key} <span data-pick-name="${index}"></span></button>`)
      .join('');
    cols.innerHTML = sim.classDef.skills
      .map(
        (skill) => `
        <button type="button" class="tree-node" data-skill="${skill.id}" title="${skill.description.replace(/"/g, '&quot;')}">
          <img class="sicon" alt="" src="${skillIcon(skill.id)}" />
          <span class="tn-name">${skill.short || skill.name}</span>
          <span class="tn-meta" data-node-meta="${skill.id}"></span>
          <span class="plus" data-upgrade="${skill.id}" hidden>+</span>
        </button>`,
      )
      .join('');
  }

  private syncTree(sim: Sim): void {
    this.text(
      '#tree-points',
      `${sim.skillPoints} skill · ${sim.statPoints} stat${document.body.classList.contains('touch') && (this.treeOpen || this.shopOpen) ? ' · paused' : ''}`,
    );
    const pending = sim.classDef.skills.find((skill) => skill.id === this.pendingSkill);
    this.text(
      '#equip-hint',
      pending
        ? `${pending.name} selected. Tap Q W E R, or drag it onto a slot.`
        : 'Spend + to learn a skill. Only rank 1 or higher can go on the belt. Drag it onto a slot, or tap it and then a slot.',
    );
    for (const key of ['str', 'dex', 'vit', 'energy'] as const) {
      const node = this.root.querySelector(`[data-attr-val="${key}"]`);
      if (node) node.textContent = String(sim.attributes[key]);
      const spend = this.root.querySelector<HTMLElement>(`[data-attr="${key}"] .spend`);
      if (spend) spend.hidden = sim.statPoints <= 0;
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
        const place = where >= 0 ? ` ${keys[where]}` : '';
        meta.textContent = unlocked ? `${rank}/${skill.maxRank}${place}` : `Lv ${skill.unlockLevel}`;
      }
      const node = this.root.querySelector<HTMLButtonElement>(`[data-skill="${skill.id}"]`);
      node?.classList.toggle('locked', !unlocked);
      node?.classList.toggle('unlearned', rank < 1);
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
    if (!this.drag.moved) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        this.drag = null;
        return;
      }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) return;
      this.drag.moved = true;
      const row = this.root.querySelector<HTMLElement>(`[data-skill="${this.drag.id}"]`);
      try {
        row?.setPointerCapture(event.pointerId);
      } catch {
        /* the row may already have released */
      }
    }
    event.preventDefault();
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

  /** A short press selects. A drag keeps the scroller. */
  private tap(host: Element | null, selector: string, fn: (el: HTMLElement) => void): void {
    if (!host) return;
    let start: { x: number; y: number } | null = null;
    host.addEventListener('pointerdown', (event) => {
      const pointer = event as PointerEvent;
      if (pointer.button !== 0) return;
      start = { x: pointer.clientX, y: pointer.clientY };
    });
    host.addEventListener('pointerup', (event) => {
      const pointer = event as PointerEvent;
      const origin = start;
      start = null;
      if (!origin) return;
      if (Math.hypot(pointer.clientX - origin.x, pointer.clientY - origin.y) > 12) return;
      const el = (event.target as HTMLElement).closest<HTMLElement>(selector);
      if (!el || !host.contains(el)) return;
      fn(el);
    });
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
