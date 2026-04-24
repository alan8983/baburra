/**
 * Per-stage timing record for the import pipeline.
 *
 * Emitted once per URL completion, aggregating the wall-clock duration,
 * success/failure flag, and retry count for each stage the URL traversed.
 * Consumed by seed-script JSONL logs and summarize-run for p50/p95
 * aggregation across a batch run.
 *
 * Not all URLs traverse all stages:
 *   - `rss_lookup` fires only on podcast platforms
 *   - `audio_download` + `deepgram` fire only on captionless audio paths
 *   - `tiingo` fires only when price hydration is part of post creation
 */

export type PipelineStage =
  | 'rss_lookup'
  | 'audio_download'
  | 'deepgram'
  | 'gemini_args'
  | 'gemini_sentiment'
  | 'tiingo'
  | 'supabase_write';

export interface StageTiming {
  stage: PipelineStage;
  ms: number;
  ok: boolean;
  retries: number;
}

/** Out-param shape populated by clients that retry internally (Deepgram). */
export interface DeepgramCallMeta {
  retries: number;
}

/** Out-param shape populated by the Gemini client across retries + key rotation. */
export interface GeminiCallMeta {
  retries: number;
  keyIndex: number;
  finalModel: string;
}
