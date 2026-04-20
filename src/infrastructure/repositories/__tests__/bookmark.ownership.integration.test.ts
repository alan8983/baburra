/**
 * Integration tests for bookmark.repository ownership filters.
 *
 * `bookmarks.user_id` is the ownership column. `removeBookmark` must only
 * delete rows belonging to the calling user — even when the (post_id) matches
 * another user's bookmark of the same post, the attacker's delete must leave
 * the victim's bookmark untouched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addBookmark, isBookmarked, removeBookmark } from '../bookmark.repository';
import {
  createTestKol,
  createTestPost,
  createTestUser,
  hasIntegrationEnv,
  type TestKol,
  type TestPost,
  type TestUser,
} from '@/test-utils/supabase-fixtures';

describe.skipIf(!hasIntegrationEnv())('bookmark.repository ownership', () => {
  let ownerUser: TestUser;
  let attackerUser: TestUser;
  let kol: TestKol;
  let post: TestPost;

  beforeAll(async () => {
    ownerUser = await createTestUser();
    attackerUser = await createTestUser();
    kol = await createTestKol(ownerUser.userId);
    post = await createTestPost({ kolId: kol.id, createdBy: ownerUser.userId });

    // Both users bookmark the same post.
    await addBookmark(ownerUser.userId, post.id);
    await addBookmark(attackerUser.userId, post.id);
  }, 30_000);

  afterAll(async () => {
    await post.cleanup().catch(() => {});
    await kol.cleanup().catch(() => {});
    await attackerUser.cleanup().catch(() => {});
    await ownerUser.cleanup().catch(() => {});
  });

  describe('removeBookmark', () => {
    it('removes only the caller’s bookmark and leaves other users’ rows intact', async () => {
      // Attacker removes *their own* bookmark of the shared post.
      await removeBookmark(attackerUser.userId, post.id);
      expect(await isBookmarked(attackerUser.userId, post.id)).toBe(false);

      // Owner's bookmark must survive — the user_id filter protected it.
      expect(await isBookmarked(ownerUser.userId, post.id)).toBe(true);
    });

    it('is a no-op for a post the user never bookmarked', async () => {
      const fakePostId = '00000000-0000-0000-0000-000000000000';
      const result = await removeBookmark(ownerUser.userId, fakePostId);
      expect(result).toBe(true);
      expect(await isBookmarked(ownerUser.userId, post.id)).toBe(true);
    });

    it('succeeds when the owner removes their own bookmark', async () => {
      const result = await removeBookmark(ownerUser.userId, post.id);
      expect(result).toBe(true);
      expect(await isBookmarked(ownerUser.userId, post.id)).toBe(false);
    });
  });
});
