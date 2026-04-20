/**
 * Integration tests for subscription.repository ownership filters.
 *
 * `kol_subscriptions.user_id` is the ownership column. `unsubscribe` must
 * only delete rows belonging to the calling user — if two users subscribe to
 * the same KOL source, one user's unsubscribe must not affect the other.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isSubscribed, subscribe, unsubscribe } from '../subscription.repository';
import {
  createTestKol,
  createTestKolSource,
  createTestUser,
  hasIntegrationEnv,
  type TestKol,
  type TestKolSource,
  type TestUser,
} from '@/test-utils/supabase-fixtures';

describe.skipIf(!hasIntegrationEnv())('subscription.repository ownership', () => {
  let ownerUser: TestUser;
  let attackerUser: TestUser;
  let kol: TestKol;
  let source: TestKolSource;

  beforeAll(async () => {
    ownerUser = await createTestUser();
    attackerUser = await createTestUser();
    kol = await createTestKol(ownerUser.userId);
    source = await createTestKolSource(kol.id);

    await subscribe(ownerUser.userId, source.id);
    await subscribe(attackerUser.userId, source.id);
  }, 30_000);

  afterAll(async () => {
    await source.cleanup().catch(() => {});
    await kol.cleanup().catch(() => {});
    await attackerUser.cleanup().catch(() => {});
    await ownerUser.cleanup().catch(() => {});
  });

  describe('unsubscribe', () => {
    it('removes only the caller’s subscription and leaves other users’ rows intact', async () => {
      await unsubscribe(attackerUser.userId, source.id);
      expect(await isSubscribed(attackerUser.userId, source.id)).toBe(false);

      // Owner's subscription must survive.
      expect(await isSubscribed(ownerUser.userId, source.id)).toBe(true);
    });

    it('is a no-op when the user was never subscribed', async () => {
      const fakeSourceId = '00000000-0000-0000-0000-000000000000';
      const result = await unsubscribe(ownerUser.userId, fakeSourceId);
      expect(result).toBe(true);
      expect(await isSubscribed(ownerUser.userId, source.id)).toBe(true);
    });

    it('succeeds when the owner unsubscribes from their own subscription', async () => {
      const result = await unsubscribe(ownerUser.userId, source.id);
      expect(result).toBe(true);
      expect(await isSubscribed(ownerUser.userId, source.id)).toBe(false);
    });
  });
});
