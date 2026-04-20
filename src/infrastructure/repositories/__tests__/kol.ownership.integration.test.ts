/**
 * Integration tests for kol.repository ownership filters.
 *
 * `kols.created_by` is the ownership column for `updateKol` — only the KOL's
 * creator may mutate name/bio/social links.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getKolById, updateKol } from '../kol.repository';
import {
  createTestKol,
  createTestUser,
  hasIntegrationEnv,
  type TestKol,
  type TestUser,
} from '@/test-utils/supabase-fixtures';

describe.skipIf(!hasIntegrationEnv())('kol.repository ownership', () => {
  let ownerUser: TestUser;
  let attackerUser: TestUser;
  let kol: TestKol;

  beforeAll(async () => {
    ownerUser = await createTestUser();
    attackerUser = await createTestUser();
    kol = await createTestKol(ownerUser.userId);
  }, 30_000);

  afterAll(async () => {
    await kol.cleanup().catch(() => {});
    await attackerUser.cleanup().catch(() => {});
    await ownerUser.cleanup().catch(() => {});
  });

  describe('updateKol', () => {
    it('succeeds when the creator calls with their own userId', async () => {
      const result = await updateKol(kol.id, ownerUser.userId, { bio: 'updated by owner' });
      expect(result).not.toBeNull();
      expect(result?.bio).toBe('updated by owner');
    });

    it('returns null when a different user attempts the update', async () => {
      const result = await updateKol(kol.id, attackerUser.userId, { bio: 'hacked' });
      expect(result).toBeNull();

      const current = await getKolById(kol.id);
      expect(current?.bio).toBe('updated by owner');
    });

    it('returns null for a non-existent kol id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await updateKol(fakeId, ownerUser.userId, { bio: 'ghost' });
      expect(result).toBeNull();
    });
  });
});
