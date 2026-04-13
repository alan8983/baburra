/**
 * Transcript post-processing cleanup.
 *
 * Fixes Deepgram Nova-3 transcription artifacts before AI analysis:
 * 1. Merges isolated single-letter English tokens ("T S M" → "TSM")
 * 2. Applies a maintainable dictionary of term corrections
 * 3. Converts Simplified Chinese → Traditional Chinese (zh-CN → zh-TW)
 *
 * Pure function: same input always produces same output, idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OpenCC = require('opencc-js') as {
  Converter: (options: { from: string; to: string }) => (text: string) => string;
};
import dictionaryData from '@/data/transcript-dictionary.json';

// ── Types ──────────────────────────────────────────────────────────────────

interface DictionaryTerm {
  pattern: string;
  replacement: string;
  regex?: boolean;
}

interface DictionaryCategory {
  description: string;
  terms: DictionaryTerm[];
}

interface TranscriptDictionary {
  version: number;
  categories: Record<string, DictionaryCategory>;
}

// ── Compiled dictionary (lazy) ─────────────────────────────────────────────

interface CompiledTerm {
  re: RegExp;
  replacement: string;
}

let _compiledTerms: CompiledTerm[] | null = null;

function getCompiledTerms(): CompiledTerm[] {
  if (_compiledTerms) return _compiledTerms;

  const dict = dictionaryData as TranscriptDictionary;
  const terms: CompiledTerm[] = [];

  for (const category of Object.values(dict.categories)) {
    for (const term of category.terms) {
      const pattern = term.regex ? term.pattern : escapeRegex(term.pattern);
      terms.push({
        re: new RegExp(pattern, 'g'),
        replacement: term.replacement,
      });
    }
  }

  _compiledTerms = terms;
  return terms;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── OpenCC converter (lazy) ────────────────────────────────────────────────

let _converter: ((text: string) => string) | null = null;

function getConverter(): (text: string) => string {
  if (!_converter) {
    _converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
  }
  return _converter;
}

// CJK Unified Ideographs range check
const CJK_REGEX = /[\u4e00-\u9fff]/;

// ── Pass 1: Merge isolated uppercase letters ───────────────────────────────

/**
 * Collapse sequences of 2+ isolated uppercase English letters separated by
 * spaces into a single token. e.g. "T S M C" → "TSMC".
 *
 * Uses word boundaries to avoid merging letters inside words.
 */
export function mergeIsolatedLetters(text: string): string {
  // Match: word-boundary, then (uppercase letter + space) repeated 1+ times,
  // ending with one more uppercase letter, then word-boundary.
  // Minimum 2 letters total.
  return text.replace(/\b([A-Z] )([A-Z] )*[A-Z]\b/g, (match) => {
    return match.replace(/ /g, '');
  });
}

// ── Pass 2: Dictionary term replacement ────────────────────────────────────

/**
 * Apply all dictionary term replacements to the text.
 * Dictionary is lazy-loaded and regex patterns are pre-compiled on first call.
 */
export function applyDictionary(text: string): string {
  const terms = getCompiledTerms();
  let result = text;
  for (const term of terms) {
    result = result.replace(term.re, term.replacement);
  }
  return result;
}

// ── Pass 3: Simplified → Traditional Chinese ───────────────────────────────

/**
 * Convert Simplified Chinese characters to Traditional Chinese using OpenCC.
 * Only processes text that contains CJK characters to avoid unnecessary work.
 */
export function convertSimplifiedToTraditional(text: string): string {
  if (!CJK_REGEX.test(text)) return text;
  return getConverter()(text);
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Clean a Deepgram transcript for AI analysis.
 *
 * Three-pass pipeline:
 * 1. Merge isolated single-letter English tokens
 * 2. Convert Simplified → Traditional Chinese (so dictionary can fix 臺→台 etc.)
 * 3. Apply dictionary term corrections (runs last to clean up OpenCC artifacts)
 *
 * Pure and idempotent: cleanTranscript(cleanTranscript(x)) === cleanTranscript(x)
 */
export function cleanTranscript(text: string): string {
  let result = mergeIsolatedLetters(text);
  result = convertSimplifiedToTraditional(result);
  result = applyDictionary(result);
  return result;
}
