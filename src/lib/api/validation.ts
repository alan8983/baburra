import { z } from 'zod';
import { NextResponse } from 'next/server';

// ─── Shared validators ────────────────────────────────────────────

const sentimentValue = z.union([
  z.literal(-2),
  z.literal(-1),
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);
const uuid = z.string().uuid();

// ─── Post schemas ─────────────────────────────────────────────────

export const createPostSchema = z.object({
  kolId: uuid,
  title: z.string().max(500).optional(),
  content: z.string().min(1).max(50000),
  sourceUrl: z.string().url().max(2000).optional(),
  sourcePlatform: z
    .enum(['twitter', 'facebook', 'threads', 'instagram', 'youtube', 'manual'])
    .default('manual'),
  images: z.array(z.string().url().max(2000)).max(10).optional(),
  sentiment: sentimentValue,
  sentimentAiGenerated: z.boolean().optional(),
  postedAt: z.union([z.string().datetime(), z.string().min(1)]).transform((v) => new Date(v)),
  stockIds: z.array(uuid).min(1).max(20),
  stockSentiments: z.record(z.string(), sentimentValue).optional(),
  draftAiArguments: z.array(z.any()).optional(),
});

export const updatePostSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().min(1).max(50000).optional(),
  sentiment: sentimentValue.optional(),
  images: z.array(z.string().max(2000)).max(10).optional(),
  stockSentiments: z.record(z.string(), sentimentValue.nullable()).optional(),
});

// ─── KOL schemas ──────────────────────────────────────────────────

export const createKolSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  avatarUrl: z.string().url().max(2000).optional(),
  bio: z.string().max(5000).optional(),
  socialLinks: z.record(z.string(), z.string().max(500)).optional(),
});

export const updateKolSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  avatarUrl: z.string().url().max(2000).optional(),
  bio: z.string().max(5000).optional(),
  socialLinks: z.record(z.string(), z.string().max(500)).optional(),
});

// ─── Stock schemas ────────────────────────────────────────────────

export const createStockSchema = z.object({
  ticker: z.string().trim().min(1, 'ticker is required').max(20),
  name: z.string().trim().min(1, 'name is required').max(200),
  logoUrl: z.string().url().max(2000).optional(),
  market: z.enum(['US', 'TW', 'HK', 'CRYPTO']).optional(),
});

// ─── Bookmark schema ──────────────────────────────────────────────

export const addBookmarkSchema = z.object({
  postId: uuid,
});

// ─── Quick input schema ───────────────────────────────────────────

export const quickInputSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(50000),
});

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Parse request body with a Zod schema. Returns parsed data or a 400 response.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
      : 'Invalid request body';
    return {
      error: NextResponse.json({ error: message }, { status: 400 }),
    };
  }

  return { data: result.data };
}
