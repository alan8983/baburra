/**
 * Integration tests for post.repository ownership filters.
 *
 * Verifies that `updatePost` / `deletePost` enforce `created_by = userId` at
 * the SQL layer — a cross-user call must silently fail (return null/false)
 * without touching the row.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deletePost, getPostById, updatePost } from '../post.repository';
import {
  createTestKol,
  createTestPost,
  createTestUser,
  hasIntegrationEnv,
  type TestKol,
  type TestPost,
  type TestUser,
} from '@/test-utils/supabase-fixtures';

describe.skipIf(!hasIntegrationEnv())('post.repository ownership', () => {
  let ownerUser: TestUser;
  let attackerUser: TestUser;
  let kol: TestKol;
  let ownerPost: TestPost;

  beforeAll(async () => {
    ownerUser = await createTestUser();
    attackerUser = await createTestUser();
    kol = await createTestKol(ownerUser.userId);
    ownerPost = await createTestPost({
      kolId: kol.id,
      createdBy: ownerUser.userId,
      content: 'original',
      sentiment: 1,
    });
  }, 30_000);

  afterAll(async () => {
    await ownerPost.cleanup().catch(() => {});
    await kol.cleanup().catch(() => {});
    await attackerUser.cleanup().catch(() => {});
    await ownerUser.cleanup().catch(() => {});
  });

  describe('updatePost', () => {
    it('succeeds when the owner calls with their own userId', async () => {
      const result = await updatePost(ownerPost.id, ownerUser.userId, {
        content: 'updated by owner',
      });
      expect(result).not.toBeNull();
      expect(result?.content).toBe('updated by owner');
    });

    it('returns null when a different user attempts the update', async () => {
      const result = await updatePost(ownerPost.id, attackerUser.userId, {
        content: 'hacked',
      });
      expect(result).toBeNull();

      // The row must be untouched.
      const current = await getPostById(ownerPost.id);
      expect(current?.content).toBe('updated by owner');
    });

    it('returns null for a non-existent post id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await updatePost(fakeId, ownerUser.userId, { content: 'ghost' });
      expect(result).toBeNull();
    });
  });

  describe('deletePost', () => {
    it('returns false when a different user attempts the delete', async () => {
      const result = await deletePost(ownerPost.id, attackerUser.userId);
      expect(result).toBe(false);

      const stillThere = await getPostById(ownerPost.id);
      expect(stillThere).not.toBeNull();
    });

    it('returns false for a non-existent post id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await deletePost(fakeId, ownerUser.userId);
      expect(result).toBe(false);
    });

    it('succeeds when the owner calls with their own userId', async () => {
      const result = await deletePost(ownerPost.id, ownerUser.userId);
      expect(result).toBe(true);

      const gone = await getPostById(ownerPost.id);
      expect(gone).toBeNull();
    });
  });
});
