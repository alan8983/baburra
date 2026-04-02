/**
 * Transcript Repository — YouTube video transcript caching
 *
 * Transcripts are stored keyed by source_url and shared across all users.
 * When a video is transcribed (via caption scraping or Gemini multimodal),
 * the transcript is cached here so subsequent requests skip the API call.
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';

export interface Transcript {
  id: string;
  sourceUrl: string;
  content: string;
  source: 'caption' | 'gemini' | 'deepgram' | 'rss_transcript';
  language: string | null;
  durationSeconds: number | null;
  createdAt: Date;
}

interface DbTranscript {
  id: string;
  source_url: string;
  content: string;
  source: string;
  language: string | null;
  duration_seconds: number | null;
  created_at: string;
}

function mapDbToTranscript(row: DbTranscript): Transcript {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    content: row.content,
    source: row.source as 'caption' | 'gemini' | 'deepgram' | 'rss_transcript',
    language: row.language,
    durationSeconds: row.duration_seconds,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Find a cached transcript by source URL.
 */
export async function findTranscriptByUrl(sourceUrl: string): Promise<Transcript | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('source_url', sourceUrl)
    .single();

  if (error || !data) return null;
  return mapDbToTranscript(data as DbTranscript);
}

/**
 * Save a transcript to the cache.
 * Uses upsert to handle concurrent saves for the same URL.
 */
export async function saveTranscript(input: {
  sourceUrl: string;
  content: string;
  source: 'caption' | 'gemini' | 'deepgram' | 'rss_transcript';
  language?: string;
  durationSeconds?: number;
}): Promise<Transcript> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('transcripts')
    .upsert(
      {
        source_url: input.sourceUrl,
        content: input.content,
        source: input.source,
        language: input.language ?? null,
        duration_seconds: input.durationSeconds ?? null,
      },
      { onConflict: 'source_url', ignoreDuplicates: true }
    )
    .select()
    .single();

  // If upsert returned nothing (duplicate), fetch the existing one
  if (error || !data) {
    const existing = await findTranscriptByUrl(input.sourceUrl);
    if (existing) return existing;
    throw new Error(error?.message ?? `Failed to save transcript for ${input.sourceUrl}`);
  }

  return mapDbToTranscript(data as DbTranscript);
}
