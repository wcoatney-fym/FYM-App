/**
 * Help Chatbot — Keyword Matching Engine
 *
 * Pure function. No side effects, no DB calls, no external dependencies.
 * Scores user input against a knowledge base of FAQ entries using
 * exact token matching with synonym support.
 *
 * Matching algorithm:
 * 1. Normalize input: lowercase, strip punctuation, split into tokens
 * 2. For each entry, count keyword hits from the user's tokens
 * 3. Score = (hits / entry.keywords.length) × (entry.weight ?? 1.0)
 * 4. Return best match above MIN_SCORE_THRESHOLD, or null
 */

import type { HelpEntry } from '@/data/help-knowledge-base';

/** Minimum score to consider a match valid */
const MIN_SCORE_THRESHOLD = 0.25;

/** Normalize raw input into matchable tokens */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\w\s'-]/g, '') // keep apostrophes and hyphens
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Strip common stop words that add noise to matching */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
  'very', 'just', 'because', 'if', 'when', 'where', 'how', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their',
]);

/** Remove stop words from token list */
export function removeStopWords(tokens: string[]): string[] {
  const filtered = tokens.filter((t) => !STOP_WORDS.has(t));
  // If filtering removes everything, return original tokens
  return filtered.length > 0 ? filtered : tokens;
}

export interface MatchResult {
  entry: HelpEntry;
  score: number;
  matchedKeywords: string[];
}

/**
 * Score a single entry against user tokens.
 * Returns null if no keywords match.
 */
function scoreEntry(entry: HelpEntry, userTokens: string[]): MatchResult | null {
  const matchedKeywords: string[] = [];

  for (const keyword of entry.keywords) {
    // Keywords can be multi-word phrases — check if all words appear in user tokens
    const keywordTokens = keyword.toLowerCase().split(/\s+/);
    const allPresent = keywordTokens.every((kt) => userTokens.includes(kt));
    if (allPresent) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length === 0) return null;

  const weight = entry.weight ?? 1.0;
  const score = (matchedKeywords.length / entry.keywords.length) * weight;

  return { entry, score, matchedKeywords };
}

/**
 * Find the best matching help entry for user input.
 *
 * @param input - Raw user message text
 * @param entries - The full knowledge base
 * @returns The best match above threshold, or null if nothing matches
 */
export function findBestMatch(
  input: string,
  entries: HelpEntry[]
): MatchResult | null {
  const rawTokens = tokenize(input);
  const userTokens = removeStopWords(rawTokens);

  let best: MatchResult | null = null;

  for (const entry of entries) {
    const result = scoreEntry(entry, userTokens);
    if (!result) continue;
    if (result.score < MIN_SCORE_THRESHOLD) continue;

    if (
      !best ||
      result.score > best.score ||
      (result.score === best.score &&
        result.matchedKeywords.length > best.matchedKeywords.length)
    ) {
      best = result;
    }
  }

  return best;
}

/**
 * Get all entries in a specific category, sorted by weight (desc).
 * Used for the "help" / "topics" command.
 */
export function getEntriesByCategory(
  entries: HelpEntry[],
  category: HelpEntry['category']
): HelpEntry[] {
  return entries
    .filter((e) => e.category === category)
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
}

/**
 * Get all unique categories from the knowledge base.
 */
export function getCategories(entries: HelpEntry[]): HelpEntry['category'][] {
  const cats = new Set(entries.map((e) => e.category));
  return Array.from(cats);
}

/** Category display labels */
export const CATEGORY_LABELS: Record<HelpEntry['category'], string> = {
  carriers: '📋 Carriers',
  contracting: '📝 Contracting',
  app: '📱 App Usage',
  production: '📊 Production',
  training: '🎓 Training',
  general: '💡 General',
};
