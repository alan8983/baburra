import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { Variant } from '@/lib/ab-test';

export interface AbEvent {
  experiment: string;
  variant: Variant;
  anonymousId?: string;
  userId?: string;
  event: string;
  metadata?: Record<string, unknown>;
}

export async function recordAbEvent(abEvent: AbEvent): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from('ab_events').insert({
    experiment: abEvent.experiment,
    variant: abEvent.variant,
    anonymous_id: abEvent.anonymousId || null,
    user_id: abEvent.userId || null,
    event: abEvent.event,
    metadata: abEvent.metadata || {},
  });

  if (error) {
    // Log but don't throw — tracking failure should never break user flow
    console.error('Failed to record AB event:', error.message);
  }
}

/** Link all anonymous events to the real user after conversion */
export async function linkAnonymousEvents(
  experiment: string,
  anonymousId: string,
  realUserId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('ab_events')
    .update({ user_id: realUserId })
    .eq('experiment', experiment)
    .eq('anonymous_id', anonymousId)
    .is('user_id', null);

  if (error) {
    console.error('Failed to link anonymous AB events:', error.message);
  }
}
