import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api/validation';
import { recordAbEvent } from '@/infrastructure/repositories/ab-experiment.repository';
import { internalError } from '@/lib/api/error';

const abEventSchema = z.object({
  experiment: z.string().min(1).max(100),
  variant: z.enum(['A', 'B']),
  anonymousId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  event: z.string().min(1).max(100),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, abEventSchema);
    if ('error' in parsed) return parsed.error;

    await recordAbEvent(parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError(error, 'Failed to record AB event');
  }
}
