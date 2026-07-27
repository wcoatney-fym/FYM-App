/**
 * competency.ts — the evolving proficiency growth model.
 *
 * Skillsets are NOT static config. They are earned from evidence: tasks
 * completed, on time, at a difficulty that stretches the person — plus
 * lighter-weight signal from conversation. This module is pure (no DB,
 * no side effects) so it is trivially unit-testable and reversible.
 *
 * Reasoning model (locked with the team 2026-07-08):
 *   1. Gain scales with STRETCH. A hard task at/above your current level
 *      teaches more than an easy task below it. Difficulty is 1-10 and is
 *      compared against your current level (0-100).
 *   2. DIMINISHING returns. The higher your level, the smaller each gain,
 *      so nobody maxes out on a single heroic task. A single task is hard-
 *      capped to a few points, and that ceiling shrinks toward 100.
 *   3. TIMELINESS is a multiplier. On-time = full credit; late = partial;
 *      reopened/reworked dampens or docks the gain.
 *   4. STALENESS. A skill unused for a long stretch drifts to 'unverified'
 *      rather than staying falsely high.
 */

export type Confidence = 'low' | 'medium' | 'high';

export interface SkillState {
  level: number; // 0-100
  confidence: Confidence;
  lastEvidenceAt?: string;
  stale?: boolean;
}

export interface TaskEvidence {
  /** Current proficiency level (0-100) in the exercised category. */
  level: number;
  /** Task difficulty, 1-10. */
  difficulty: number;
  /** Completed on or before the due date. */
  onTime: boolean;
  /** How many times the task was reopened/reworked (0 = clean). */
  reopened?: number;
}

/** Absolute ceiling any single task can add to a proficiency level. */
export const MAX_SINGLE_TASK_GAIN = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Compute the proficiency delta earned by completing one task.
 * Returns a value in the range [-MAX_SINGLE_TASK_GAIN, MAX_SINGLE_TASK_GAIN];
 * negative only when a task is repeatedly reworked (net-negative signal).
 */
export function computeGain(ev: TaskEvidence): number {
  const level = clamp(ev.level, 0, 100);
  const difficulty = clamp(ev.difficulty, 1, 10);
  const reopened = Math.max(0, ev.reopened ?? 0);

  // Difficulty expressed on the same 0-100 scale as level (10 -> 100).
  const difficultyScore = difficulty * 10;

  // (1) STRETCH: how far the task reaches beyond current level, normalized.
  // A task well above your level gives the strongest signal (~1.0); a task
  // well below barely teaches anything (floored small, not zero).
  const stretch = clamp((difficultyScore - level) / 100, 0, 1);
  const stretchFactor = 0.15 + 0.85 * stretch; // 0.15 floor so easy wins still count a little

  // (2) DIMINISHING returns: gains shrink as level approaches 100.
  const headroomFactor = (100 - level) / 100;

  // Base gain before modifiers, bounded by the single-task ceiling.
  let gain = MAX_SINGLE_TASK_GAIN * stretchFactor * headroomFactor;

  // (3) TIMELINESS multiplier.
  const timeliness = ev.onTime ? 1 : 0.4;
  gain *= timeliness;

  // Reopens/rework dampen the gain, and heavy rework can net negative.
  if (reopened > 0) {
    gain -= reopened * 0.75;
  }

  const delta = clamp(gain, -MAX_SINGLE_TASK_GAIN, MAX_SINGLE_TASK_GAIN);
  return roundTo(delta, 2);
}

/** Apply a computed delta to a level, clamped to [0, 100]. */
export function applyGain(level: number, delta: number): number {
  return roundTo(clamp(level + delta, 0, 100), 2);
}

/**
 * Bump confidence with accumulating evidence. More completed tasks in a
 * category => higher confidence in the number.
 */
export function confidenceFor(evidenceCount: number): Confidence {
  if (evidenceCount >= 8) return 'high';
  if (evidenceCount >= 3) return 'medium';
  return 'low';
}

/**
 * Staleness: a skill with no evidence for a long stretch should not keep
 * presenting as firmly known. After ~90 days it drifts to 'low'/stale.
 */
export function applyStaleness(state: SkillState, daysSinceEvidence: number): SkillState {
  if (daysSinceEvidence >= 90) {
    return { ...state, stale: true, confidence: 'low' };
  }
  if (daysSinceEvidence >= 45 && state.confidence === 'high') {
    return { ...state, confidence: 'medium' };
  }
  return { ...state, stale: false };
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
