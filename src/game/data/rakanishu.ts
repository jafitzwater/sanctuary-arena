/**
 * t345u "Put Rakanishu in the game": numbers for Rakanishu's lightning (pure data, no imports).
 * [JOSEPH t345u] "whenever anyone hits him, bolts spark out from him and damage every non-mob unit (heroes,
 * minions) in a short radius, unless that unit dodges the bolt ... Per-hit cooldown so there are no rapid huge
 * bursts (e.g. at most one lightning burst every ~1.5 s, modest damage)".
 * The repo has no dodge or skillshot system, so the dodge rule is the order's fallback:
 *   each bolt is aimed at where its target stands at the moment of the burst and lands SPARK_DELAY later;
 *   the target is hit only if it is still within its own radius + SPARK_DODGE_SLACK of that spot.
 *   A hero who keeps moving (any hero speed covers 60+ px in 0.4 s) dodges; one standing still to trade is hit.
 * All distances are played-map px (the 6800 map), like UnitDef ranges.
 */
export const RAKANISHU_ID = 'rakanishu';
/** At most one burst per this many seconds, however many hits land. */
export const SPARK_COOLDOWN = 1.5;
/** Short radius around Rakanishu (his melee reach is 56, his aggro 210). */
export const SPARK_RADIUS = 150;
/** Damage per bolt before armor (magic school). His sword does 24 per second; a burst adds about 9 per second. */
export const SPARK_DAMAGE = 14;
/** Bolt travel time in seconds: the dodge window. */
export const SPARK_DELAY = 0.4;
/** Extra px beyond the target's own radius that still counts as "in the bolt's path". */
export const SPARK_DODGE_SLACK = 10;
/** How long a landed bolt's impact spark stays drawn (s). */
export const SPARK_FADE = 0.3;
