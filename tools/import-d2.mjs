/**
 * Convert committed Diablo II 1.13c TXT tables into JSON under src/game/data/d2.
 *
 * Sources (no network at runtime or in this script):
 *   tools/vendor/d2-113c/*.txt
 *     from https://github.com/fabd/diablo2/tree/master/code/d2_113_data (patch 1.13c)
 *   tools/vendor/d2-113c/strings.json
 *     skillname/skillsd/skillld 126–155 trimmed from
 *     https://github.com/blizzhackers/d2data/blob/master/json/localestrings-eng.json
 *
 * CharStats life/mana/stamina columns are stored in fourths. MOBA numbers are
 * a pacing scale on top of those real values; raw columns are kept beside them.
 *
 * Run: node tools/import-d2.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'tools/vendor/d2-113c');
const outDir = join(root, 'src/game/data/d2');

const LIFE_SCALE = 6;
const MANA_SCALE = 8;
const MANA_COST_SCALE = 2;
const SPEED_UNIT = 30;
const WEAPON_AD_SCALE = 4;
const ARMOR_DEF_SCALE = 1.2;
const MONSTER_HP_SCALE = 6;
const MONSTER_TANK_HP_SCALE = 4;
const MONSTER_DMG_SCALE = 0.24;
const FOURTHS = 4;

const TAB_NAMES = {
  1: 'Combat Skills',
  2: 'Combat Masteries',
  3: 'Warcries',
};

/** Match pacing. Skills.txt `delay` is empty on these rows. */
const COOLDOWNS = {
  bash: 6,
  'double-swing': 4.5,
  stun: 7,
  concentrate: 5,
  leap: 9,
  'leap-attack': 8,
  whirlwind: 11,
  frenzy: 7,
  berserk: 8,
  'double-throw': 5,
  howl: 10,
  taunt: 8,
  shout: 12,
  'battle-cry': 11,
  'war-cry': 13,
  'battle-orders': 16,
  'battle-command': 18,
  'find-potion': 14,
  'find-item': 12,
  'grim-ward': 16,
};

const WEAPON_TYPES = new Set(['axe', 'swor', 'mace', 'club', 'hamm', 'spea', 'pole', 'knif', 'tkni', 'taxe', 'jave']);
const QUEST_CODES = new Set(['leg', 'hfh', 'hdm', 'd33', 'g33']);
const THROWN_TYPES = new Set(['tkni', 'taxe', 'jave']);
const ARMOR_SLOTS = { helm: 'helm', tors: 'armor', belt: 'belt', shie: 'shield' };
const MONSTER_IDS = ['fallen1', 'zombie1', 'quillrat1', 'bloodraven', 'corruptrogue1', 'fallenshaman1'];
const RANGED_AI = new Set(['QuillRat', 'BloodRaven', 'CorruptRogue']);

function parseTxt(name) {
  const lines = readFileSync(join(vendor, name), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines[0].split('\t');
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split('\t');
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? '';
    rows.push(row);
  }
  return rows;
}

function num(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** skillld* strings are stored bottom-up, one clause per line. */
function upright(value) {
  const lines = String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines[0] ?? '';
  return lines.reverse().join(' ');
}

function write(name, data) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

const strings = JSON.parse(readFileSync(join(vendor, 'strings.json'), 'utf8'));

function skillText(id) {
  const longText = upright(strings[`skillld${id}`] ?? '');
  const shortText = upright(strings[`skillsd${id}`] ?? '');
  return {
    name: strings[`skillname${id}`] || '',
    short: shortText,
    long: longText,
  };
}

function importModes() {
  return parseTxt('PlrMode.txt').map((row) => ({
    name: row.Name,
    token: row.Token,
    code: row.Code,
  }));
}

function importClasses() {
  return parseTxt('CharStats.txt')
    .filter((row) => row.class && row.str)
    .map((row) => {
      const vit = num(row.vit);
      const energy = num(row.int);
      const lifePerVit = num(row.LifePerVitality) / FOURTHS;
      const lifePerLevel = num(row.LifePerLevel) / FOURTHS;
      const manaPerEnergy = num(row.ManaPerMagic) / FOURTHS;
      const manaPerLevel = num(row.ManaPerLevel) / FOURTHS;
      const d2Life = vit * lifePerVit + num(row.hpadd);
      const d2Mana = energy * manaPerEnergy;
      return {
        id: slug(row.class),
        name: row.class,
        token: row.class === 'Barbarian' ? 'BA' : '',
        raw: {
          str: num(row.str),
          dex: num(row.dex),
          energy,
          vit,
          stamina: num(row.stamina),
          hpadd: num(row.hpadd),
          walkVelocity: num(row.WalkVelocity),
          runVelocity: num(row.RunVelocity),
          runDrain: num(row.RunDrain),
          manaRegen: num(row.ManaRegen),
          lifePerLevelFourths: num(row.LifePerLevel),
          staminaPerLevelFourths: num(row.StaminaPerLevel),
          manaPerLevelFourths: num(row.ManaPerLevel),
          lifePerVitalityFourths: num(row.LifePerVitality),
          staminaPerVitalityFourths: num(row.StaminaPerVitality),
          manaPerMagicFourths: num(row.ManaPerMagic),
          statPerLevel: num(row.StatPerLevel),
          blockFactor: num(row.BlockFactor),
        },
        moba: {
          str: num(row.str),
          dex: num(row.dex),
          energy,
          vit,
          life: Math.round(d2Life * LIFE_SCALE),
          mana: Math.round(d2Mana * MANA_SCALE),
          hpPerLevel: lifePerLevel * LIFE_SCALE,
          manaPerLevel: manaPerLevel * MANA_SCALE,
          hpPerVit: lifePerVit * LIFE_SCALE,
          manaPerEnergy: manaPerEnergy * MANA_SCALE,
          statPointsPerLevel: num(row.StatPerLevel),
          walkSpeed: num(row.WalkVelocity) * SPEED_UNIT,
          runSpeed: num(row.RunVelocity) * SPEED_UNIT,
          baseAd: 48,
          adPerStr: 0.5,
          baseArmor: 8,
          armorPerDex: 0.4,
          regenHp: 2.4,
          regenMana: 3.4,
        },
      };
    });
}

function importBarbarianSkills() {
  const desc = new Map(parseTxt('SkillDesc.txt').map((row) => [row.skilldesc, row]));
  const skills = parseTxt('Skills.txt').filter((row) => row.charclass === 'bar');
  const byName = new Map(skills.map((row) => [row.skill, row]));
  return skills.map((row) => {
    const meta = desc.get(row.skilldesc) ?? {};
    const text = skillText(row.Id);
    const id = slug(text.name || row.skill);
    const prereqs = [row.reqskill1, row.reqskill2]
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        const match = [...byName.keys()].find((key) => key.toLowerCase() === name.toLowerCase());
        const skillRow = match ? byName.get(match) : null;
        const label = skillRow ? skillText(skillRow.Id).name || match : name;
        return slug(label);
      });
    const passive = row.passive === '1';
    const reqLevel = num(row.reqlevel);
    const mana = num(row.mana);
    const manaPerRank = num(row.lvlmana);
    const description = text.long || text.short || row.skill;
    const prereqNames = [row.reqskill1, row.reqskill2].map((name) => name.trim()).filter(Boolean);
    const synergy = prereqNames.length ? `Requires ${prereqNames.join(' and ')}.` : '';
    const sentence = description.endsWith('.') ? description : `${description}.`;
    return {
      id,
      name: text.name || row.skill,
      d2Id: num(row.Id),
      tab: num(meta.SkillPage) || 1,
      tabName: TAB_NAMES[num(meta.SkillPage)] ?? 'Skills',
      row: num(meta.SkillRow) || 1,
      col: num(meta.SkillColumn) || 1,
      passive,
      reqLevel,
      unlockLevel: Math.max(1, Math.round(reqLevel / 6)),
      prereqs,
      maxRank: num(row.maxlvl) || 20,
      mana: Math.round(Math.max(num(row.minmana), mana) * MANA_COST_SCALE),
      manaPerRank: manaPerRank * MANA_COST_SCALE,
      minMana: Math.round(num(row.minmana) * MANA_COST_SCALE),
      cooldown: passive ? 0 : (COOLDOWNS[id] ?? 8),
      anim: row.anim || (passive ? '' : 'SC'),
      param1: num(row.Param1),
      param2: num(row.Param2),
      srcDam: num(row.SrcDam),
      starter: id === 'bash',
      short: text.short,
      description: [sentence.charAt(0).toUpperCase() + sentence.slice(1), synergy].filter(Boolean).join(' '),
    };
  });
}

function weaponDamage(row, twoHand) {
  const min = twoHand ? num(row['2handmindam']) : num(row.mindam);
  const max = twoHand ? num(row['2handmaxdam']) : num(row.maxdam);
  if (max <= 0) return { min: 0, max: 0, ad: 0 };
  return { min, max, ad: Math.round(((min + max) / 2) * WEAPON_AD_SCALE) };
}

function importItems() {
  const items = [];
  for (const row of parseTxt('Weapons.txt')) {
    if (!row.code || row.code !== row.normcode || QUEST_CODES.has(row.code)) continue;
    if (!WEAPON_TYPES.has(row.type)) continue;
    const level = num(row.level);
    const levelReq = num(row.levelreq);
    const cost = num(row.cost);
    if (level > 12 || levelReq > 8 || cost <= 0 || cost > 2000) continue;
    const twoHanded = row['2handed'] === '1';
    const oneOrTwo = row['1or2handed'] === '1';
    const asTwo = twoHanded;
    const primary = weaponDamage(row, asTwo);
    const one = weaponDamage(row, false);
    const thrown = THROWN_TYPES.has(row.type);
    const missile = {
      min: num(row.minmisdam),
      max: num(row.maxmisdam),
    };
    const ad = primary.ad || one.ad;
    if (ad <= 0 && missile.max <= 0) continue;
    const reqStr = num(row.reqstr);
    const reqDex = num(row.reqdex);
    const speed = num(row.speed);
    const wclass = (asTwo && !oneOrTwo ? row['2handedwclass'] : row.wclass || '1hs').toUpperCase();
    const wclass2 = (row['2handedwclass'] || wclass).toUpperCase();
    items.push({
      id: row.code,
      name: row.name.trim(),
      cost,
      slot: 'weapon',
      description: describeWeapon({
        min: asTwo ? primary.min : one.min || primary.min,
        max: asTwo ? primary.max : one.max || primary.max,
        ad,
        reqStr,
        reqDex,
        speed,
        wclass: asTwo ? wclass2 : wclass,
        twoHanded,
        oneOrTwo,
        thrown,
      }),
      ad,
      adOne: one.ad,
      adOff: oneOrTwo || !twoHanded ? Math.round((one.ad || ad) * 0.5) : 0,
      throwAd: missile.max > 0 ? Math.round(((missile.min + missile.max) / 2) * WEAPON_AD_SCALE) : 0,
      armor: 0,
      hp: 0,
      mana: 0,
      reqStr,
      reqDex,
      speed,
      wclass: asTwo && !oneOrTwo ? wclass2 : (row.wclass || '1hs').toUpperCase(),
      wclass2,
      twoHanded,
      oneOrTwo,
      thrown,
      weaponType: row.type,
      level,
      levelReq,
    });
  }

  for (const row of parseTxt('Armor.txt')) {
    const slot = ARMOR_SLOTS[row.type];
    if (!slot || !row.code || row.code !== row.normcode) continue;
    const level = num(row.level);
    const levelReq = num(row.levelreq);
    const cost = num(row.cost);
    if (level > 12 || levelReq > 8 || cost <= 0 || cost > 5000) continue;
    const min = num(row.minac);
    const max = num(row.maxac);
    const armor = Math.max(1, Math.round(((min + max) / 2) * ARMOR_DEF_SCALE));
    const reqStr = num(row.reqstr);
    const reqDex = num(row.reqdex);
    const name = row.name
      .trim()
      .replace(/\/hat$/, '')
      .replace(/\([A-Z]\)$/, '')
      .trim();
    items.push({
      id: row.code,
      name,
      cost,
      slot,
      description: `${min}–${max} defense (${armor} armor).${reqStr ? ` Requires ${reqStr} strength.` : ''}`,
      ad: 0,
      adOne: 0,
      adOff: 0,
      throwAd: 0,
      armor,
      hp: 0,
      mana: 0,
      reqStr,
      reqDex,
      speed: num(row.speed),
      wclass: '',
      wclass2: '',
      twoHanded: false,
      oneOrTwo: false,
      thrown: false,
      weaponType: '',
      level,
      levelReq,
    });
  }

  items.sort((a, b) => a.slot.localeCompare(b.slot) || a.cost - b.cost || a.name.localeCompare(b.name));
  return items;
}

function describeWeapon(item) {
  const hands = item.oneOrTwo ? '1H or 2H' : item.twoHanded ? '2H' : '1H';
  const req = [
    item.reqStr ? `${item.reqStr} str` : '',
    item.reqDex ? `${item.reqDex} dex` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const speed = item.speed === 0 ? 'base speed' : item.speed < 0 ? `${item.speed} speed (faster)` : `+${item.speed} speed (slower)`;
  return `${hands} ${item.wclass} · ${item.min}–${item.max} damage (+${item.ad} attack) · ${speed}${req ? ` · ${req}` : ''}${item.thrown ? ' · throwing' : ''}`;
}

function importMonsters() {
  const rows = parseTxt('MonStats.txt');
  return MONSTER_IDS.map((id) => {
    const row = rows.find((entry) => entry.Id === id);
    if (!row) throw new Error(`Missing MonStats ${id}`);
    const minHp = num(row.minHP);
    const maxHp = num(row.maxHP);
    const avgHp = (minHp + maxHp) / 2;
    const minD = num(row.A1MinD);
    const maxD = num(row.A1MaxD);
    const avgD = (minD + maxD) / 2;
    const ranged = RANGED_AI.has(row.AI);
    const boss = num(row.Level) >= 10;
    const hpScale = boss ? 3 : avgHp >= 100 ? MONSTER_TANK_HP_SCALE : MONSTER_HP_SCALE;
    const hp = Math.round(avgHp * hpScale);
    const ad = Math.round(Math.min(boss ? 55 : 36, Math.max(boss ? 36 : 14, avgD * (boss ? 0.55 : MONSTER_DMG_SCALE))));
    const velocity = num(row.Velocity);
    return {
      id: slug(row.NameStr || id),
      monId: id,
      name: row.NameStr || id,
      ai: row.AI,
      raw: {
        level: num(row.Level),
        minHp,
        maxHp,
        ac: num(row.AC),
        exp: num(row.Exp),
        velocity,
        run: num(row.Run),
        a1MinD: minD,
        a1MaxD: maxD,
      },
      moba: {
        hp,
        ad,
        armor: boss ? Math.max(8, Math.round(num(row.AC) / 8)) : Math.max(1, Math.round(num(row.AC) / 40)),
        moveSpeed: boss ? Math.round(120 + velocity * 15) : Math.round(48 + velocity * 14),
        attackRange: ranged ? (boss ? 250 : 190) : 48,
        attackInterval: boss ? 1.15 : ranged ? 1.25 : id === 'zombie1' ? 1.32 : 0.95,
        gold: Math.round(num(row.Exp) * (boss ? 1.15 : 0.45)),
        xp: Math.round(num(row.Exp) * (boss ? 1.25 : 0.55)),
        ranged,
        projectileSpeed: ranged ? 460 : 0,
      },
    };
  });
}

const classes = importClasses();
const skills = importBarbarianSkills();
const items = importItems();
const monsters = importMonsters();
const modes = importModes();

const manifest = {
  game: 'Diablo II',
  patch: '1.13c',
  generatedBy: 'tools/import-d2.mjs',
  sources: [
    {
      tables: 'CharStats.txt, Skills.txt, SkillDesc.txt, Weapons.txt, Armor.txt, ItemTypes.txt, MonStats.txt, PlrMode.txt',
      repo: 'https://github.com/fabd/diablo2/tree/master/code/d2_113_data',
      path: 'tools/vendor/d2-113c',
    },
    {
      strings: 'skillname/skillsd/skillld 126-155',
      repo: 'https://github.com/blizzhackers/d2data/blob/master/json/localestrings-eng.json',
      path: 'tools/vendor/d2-113c/strings.json',
    },
  ],
  scale: {
    fourths: FOURTHS,
    lifeScale: LIFE_SCALE,
    manaScale: MANA_SCALE,
    manaCostScale: MANA_COST_SCALE,
    speedUnit: SPEED_UNIT,
    weaponAdScale: WEAPON_AD_SCALE,
    armorDefScale: ARMOR_DEF_SCALE,
    monsterHpScale: MONSTER_HP_SCALE,
    monsterDmgScale: MONSTER_DMG_SCALE,
    skillUnlockDivisor: 6,
  },
  notes: [
    'CharStats LifePerLevel, ManaPerLevel, LifePerVitality, ManaPerMagic, and StatPerLevel are stored in fourths. Dividing by 4 is the displayed Diablo II value.',
    'MOBA life = (vitality * LifePerVitality/4 + hpadd) * lifeScale, then + hpPerLevel per match level and + hpPerVit per vitality spent.',
    'MOBA mana = (energy * ManaPerMagic/4) * manaScale. Skill mana = max(minmana, mana + lvlmana*(rank-1)) * manaCostScale.',
    'Unlock level = max(1, round(reqlevel / 6)) so a short match can open the tree. reqLevel keeps the 1.13c number.',
    'Cooldowns are match pacing. The delay column is empty for Barbarian skills.',
    'Shop items are normal bases (code == normcode) a Barbarian can use, level <= 12 and levelreq <= 8. Exceptional and elite codes are left out.',
    'Weapon attack bonus = average damage * 4. A second one-hander adds half. wclass / 2handedwclass pick the attack pose.',
    'Monster life = average(minHP, maxHP) * 6, or * 4 when that average is at least 100 (so a Zombie stays a lane tank), and * 3 for bosses. A1MinD/A1MaxD is scaled by 0.24 because those columns are far above life.',
    'PlrMode tokens organize sprites (NU, WL, RN, A1, A2, S1, GH, DD). DCC/COF files are not extracted.',
  ],
};

write('manifest.json', manifest);
write('charstats.json', classes);
write('skills-barbarian.json', skills);
write('items-act1.json', items);
write('monsters-act1.json', monsters);
write('plrmode.json', modes);

console.log(
  `classes ${classes.length}, bar skills ${skills.length}, items ${items.length}, monsters ${monsters.length}, modes ${modes.length}`,
);
console.log(
  'items',
  items.map((item) => `${item.id}:${item.slot}:${item.cost}`).join(' '),
);
