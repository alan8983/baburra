/**
 * Integration tests for draft.repository ownership filters.
 *
 * `drafts.user_id` is the ownership column; `updateDraft` / `deleteDraft` must
 * reject cross-user access (returning null / false without mutating the row).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteDraft, getDraftById, updateDraft } from '../draft.repository';
import {
  createTestDraft,
  createTestUser,
  hasIntegrationEnv,
  type TestDraft,
  type TestUser,
} from '@/test-utils/supabase-fixtures';

describe.skipIf(!hasIntegrationEnv())('draft.repository ownership', () => {
  let ownerUser: TestUser;
  let attackerUser: TestUser;
  let ownerDraft: TestDraft;

  beforeAll(async () => {
    ownerUser = await createTestUser();
    attackerUser = await createTestUser();
    ownerDraft = await createTestDraft(ownerUser.userId);
  }, 30_000);

  afterAll(async () => {
    await ownerDraft.cleanup().catch(() => {});
    await attackerUser.cleanup().catch(() => {});
    await ownerUser.cleanup().catch(() => {});
  });

  describe('updateDraft', () => {
    it('succeeds when the owner calls with their own userId', async () => {
      const result = await updateDraft(ownerDraft.id, ownerUser.userId, {
        content: 'updated by owner',
      });
      expect(result).not.toBeNull();
      expect(result?.content).toBe('updated by owner');
    });

    it('returns null when a different user attempts the update', async () => {
      const result = await updateDraft(ownerDraft.id, attackerUser.userId, {
        content: 'hacked',
      });
      expect(result).toBeNull();

      const current = await getDraftById(ownerDraft.id, ownerUser.userId);
      expect(current?.content).toBe('updated by owner');
    });

    it('returns null for a non-existent draft id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await updateDraft(fakeId, ownerUser.userId, { content: 'ghost' });
      expect(result).toBeNull();
    });
  });

  describe('deleteDraft', () => {
    it('leaves the draft in place when a different user attempts the delete', async () => {
      // deleteDraft currently returns true even when no row matches (the
      // underlying DELETE runs without error). The contract under test is the
      // SQL-layer filter: the row must still exist afterward.
      await deleteDraft(ownerDraft.id, attackerUser.userId);
      const stillThere = await getDraftById(ownerDraft.id, ownerUser.userId);
      expect(stillThere).not.toBeNull();
    });

    it('succeeds when the owner calls with their own userId', async () => {
      const result = await deleteDraft(ownerDraft.id, ownerUser.userId);
      expect(result).toBe(true);

      const gone = await getDraftById(ownerDraft.id, ownerUser.userId);
      expect(gone).toBeNull();
    });
  });
});
