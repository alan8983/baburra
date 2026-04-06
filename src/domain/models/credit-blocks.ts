// Credit "lego" block catalogue and recipe composition helper.
//
// See `docs/CREDIT_COST_BREAKDOWN.md` for the rationale and the source of
// truth for unit prices. Every charged action in the import pipeline is
// expressed as a `Recipe` (a list of `{ block, units }` items) and the total
// credit cost is computed via `composeCost`.

export type BlockId =
  | 'scrape.html'
  | 'scrape.youtube_meta'
  | 'scrape.youtube_captions'
  | 'scrape.rss'
  | 'scrape.apify.profile'
  | 'scrape.apify.post'
  | 'download.audio.short'
  | 'download.audio.long'
  | 'transcribe.audio'
  | 'transcribe.cached_transcript'
  | 'ai.analyze.short'
  | 'ai.analyze.long'
  | 'ai.reroll';

export interface CreditBlock {
  /** Credit price per unit. May be fractional; only the final recipe total is rounded. */
  credits: number;
  /** Human-facing unit name. */
  unit: string;
}

export const CREDIT_BLOCKS: Record<BlockId, CreditBlock> = {
  'scrape.html': { credits: 0.2, unit: 'page' },
  'scrape.youtube_meta': { credits: 0.2, unit: 'video' },
  'scrape.youtube_captions': { credits: 0.5, unit: 'video' },
  'scrape.rss': { credits: 0.3, unit: 'feed' },
  'scrape.apify.profile': { credits: 2.0, unit: 'run' },
  'scrape.apify.post': { credits: 0.5, unit: 'item' },
  'download.audio.short': { credits: 0.3, unit: 'file' },
  'download.audio.long': { credits: 0.1, unit: 'minute' },
  'transcribe.audio': { credits: 1.5, unit: 'minute' },
  'transcribe.cached_transcript': { credits: 0.2, unit: 'doc' },
  'ai.analyze.short': { credits: 1.0, unit: 'call' },
  'ai.analyze.long': { credits: 1.0, unit: '2k tokens' },
  'ai.reroll': { credits: 2.0, unit: 'call' },
};

export interface RecipeItem {
  block: BlockId;
  units: number;
}

export type Recipe = RecipeItem[];

/**
 * Sum a recipe into a single credit total. Fractional block prices and
 * fractional unit counts are summed in floating point and rounded UP to the
 * nearest integer ONLY at the final total. Empty recipes return 0.
 */
export function composeCost(recipe: Recipe): number {
  if (recipe.length === 0) return 0;
  let total = 0;
  for (const item of recipe) {
    const block = CREDIT_BLOCKS[item.block];
    total += block.credits * item.units;
  }
  return Math.ceil(total);
}
