import { z } from 'zod';
import { NextResponse } from 'next/server';

// ─── Error payload type ──────────────────────────────────────────

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

/** Build a JSON error response with the standard `{ error: { code, message, details? } }` shape. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  const body: { error: ApiErrorPayload } = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status });
}

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

// ─── Subscription schema ─────────────────────────────────────────

export const subscribeSchema = z.object({
  kolSourceId: uuid,
});

// ─── Quick input schema ───────────────────────────────────────────

export const quickInputSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(50000),
});

// ─── Draft schemas ───────────────────────────────────────────────

const optionalDateTransform = z
  .union([z.string().datetime(), z.string().min(1)])
  .transform((v) => new Date(v))
  .optional();

export const createDraftSchema = z.object({
  kolId: uuid.optional(),
  kolNameInput: z.string().max(200).optional(),
  content: z.string().max(50000).optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  images: z.array(z.string().max(2000)).max(10).optional(),
  sentiment: sentimentValue.optional(),
  stockSentiments: z.record(z.string(), sentimentValue).optional(),
  postedAt: optionalDateTransform,
  stockIds: z.array(uuid).optional(),
  stockNameInputs: z.array(z.string().max(200)).optional(),
  aiArguments: z.array(z.any()).optional(),
});

export const updateDraftSchema = z.object({
  kolId: uuid.nullable().optional(),
  kolNameInput: z.string().max(200).nullable().optional(),
  content: z.string().max(50000).nullable().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  images: z.array(z.string().max(2000)).max(10).optional(),
  sentiment: sentimentValue.nullable().optional(),
  stockSentiments: z.record(z.string(), sentimentValue).nullable().optional(),
  postedAt: z
    .union([z.string().datetime(), z.string().min(1)])
    .transform((v) => new Date(v))
    .nullable()
    .optional(),
  stockIds: z.array(uuid).optional(),
  stockNameInputs: z.array(z.string().max(200)).optional(),
  aiArguments: z.array(z.any()).nullable().optional(),
});

// ─── Profile schema ──────────────────────────────────────────────

export const updateProfileSchema = z.object({
  displayName: z.string().max(200).optional(),
  timezone: z.string().max(100).optional(),
  colorPalette: z.enum(['american', 'asian']).optional(),
});

// ─── AI schemas ──────────────────────────────────────────────────

export const aiContentSchema = z.object({
  content: z.string().min(10, 'content must be at least 10 characters').max(10000),
});

export const aiExtractArgumentsSchema = z.object({
  content: z.string().min(1).max(50000),
  postId: uuid,
  stocks: z
    .array(
      z.object({
        id: uuid,
        ticker: z.string().min(1).max(20),
        name: z.string().min(1).max(200),
      })
    )
    .min(1),
});

export const aiExtractDraftArgumentsSchema = z.object({
  content: z.string().min(1).max(50000),
  stocks: z
    .array(
      z.object({
        ticker: z.string().min(1).max(20),
        name: z.string().min(1).max(200),
      })
    )
    .min(1),
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
      error: errorResponse(400, 'INVALID_JSON', 'Invalid JSON body'),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
      : 'Invalid request body';
    return {
      error: errorResponse(400, 'VALIDATION_ERROR', message, result.error.issues),
    };
  }

  return { data: result.data };
}
