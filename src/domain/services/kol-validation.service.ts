/**
 * KOL Validation Service — Qualification scoring for the quality gate
 */

import type { ValidationScore } from '@/domain/models/kol';
import type { PostWithRelations } from '@/domain/models/post';
import { updateValidationStatus } from '@/infrastructure/repositories/kol.repository';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { createAdminClient } from '@/infrastructure/supabase/admin';

// Qualification thresholds (hardcoded for v1)
export const COVERAGE_THRESHOLD = 0.6; // ≥ 60% of posts must produce at least one ticker
export const DIRECTIONALITY_THRESHOLD = 0.5; // ≥ 50% of posts with tickers must have non-zero sentiment
export const AVG_ARGUMENTS_THRESHOLD = 1.5; // Average arguments per post ≥ 1.5

/**
 * Calculate the qualification score for a KOL based on their sampled posts.
 * Returns a ValidationScore with pass/fail and detailed breakdown.
 */
export function calculateValidationScore(
  posts: PostWithRelations[],
  argumentCounts: Record<string, number> // postId → argument count
): ValidationScore {
  const totalPosts = posts.length;

  if (totalPosts === 0) {
    return {
      totalPosts: 0,
      postsWithTickers: 0,
      coverageRate: 0,
      postsWithSentiment: 0,
      directionalityRate: 0,
      totalArguments: 0,
      avgArgumentsPerPost: 0,
      passed: false,
      failedCriteria: ['coverage', 'directionality', 'analytical_depth'],
    };
  }

  // Coverage: posts with at least one ticker
  const postsWithTickers = posts.filter((p) => p.stocks.length > 0).length;
  const coverageRate = postsWithTickers / totalPosts;

  // Directionality: among posts with tickers, how many have non-zero sentiment
  const postsWithSentiment =
    postsWithTickers > 0 ? posts.filter((p) => p.stocks.length > 0 && p.sentiment !== 0).length : 0;
  const directionalityRate = postsWithTickers > 0 ? postsWithSentiment / postsWithTickers : 0;

  // Analytical depth: average argument count across all posts
  const totalArguments = Object.values(argumentCounts).reduce((sum, count) => sum + count, 0);
  const avgArgumentsPerPost = totalPosts > 0 ? totalArguments / totalPosts : 0;

  // Check criteria
  const failedCriteria: string[] = [];
  if (coverageRate < COVERAGE_THRESHOLD) failedCriteria.push('coverage');
  if (directionalityRate < DIRECTIONALITY_THRESHOLD) failedCriteria.push('directionality');
  if (avgArgumentsPerPost < AVG_ARGUMENTS_THRESHOLD) failedCriteria.push('analytical_depth');

  return {
    totalPosts,
    postsWithTickers,
    coverageRate: Math.round(coverageRate * 1000) / 1000,
    postsWithSentiment,
    directionalityRate: Math.round(directionalityRate * 1000) / 1000,
    totalArguments,
    avgArgumentsPerPost: Math.round(avgArgumentsPerPost * 100) / 100,
    passed: failedCriteria.length === 0,
    failedCriteria,
  };
}

/**
 * Generate a human-readable rejection reason from failed criteria.
 */
export function getValidationRejectReason(score: ValidationScore): string {
  if (score.passed) return '';

  const reasons: string[] = [];
  if (score.failedCriteria.includes('coverage')) {
    reasons.push('近期內容未發現足夠可追蹤的投資標的');
  }
  if (score.failedCriteria.includes('directionality')) {
    reasons.push('內容缺乏明確的投資方向性觀點');
  }
  if (score.failedCriteria.includes('analytical_depth')) {
    reasons.push('分析論述深度不足');
  }
  return reasons.join('；');
}

/**
 * Handle validation completion: score the KOL, update status, clean up if rejected.
 * Called after a validation_scrape job completes.
 */
export async function handleValidationCompletion(kolId: string): Promise<ValidationScore> {
  // Fetch the KOL's posts (validation scrape produces at most 10)
  const { data: posts } = await listPosts({ kolId, limit: 20 });

  // Fetch argument counts per post
  const supabase = createAdminClient();
  const postIds = posts.map((p) => p.id);
  const argumentCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    const { data: argRows } = await supabase
      .from('post_arguments')
      .select('post_id')
      .in('post_id', postIds);

    for (const row of argRows ?? []) {
      const pid = row.post_id as string;
      argumentCounts[pid] = (argumentCounts[pid] ?? 0) + 1;
    }
  }

  const score = calculateValidationScore(posts, argumentCounts);

  if (score.passed) {
    await updateValidationStatus(kolId, 'active', score);
  } else {
    await updateValidationStatus(kolId, 'rejected', score);
    // Delete validation posts (they're a small sample, not worth keeping)
    if (postIds.length > 0) {
      await supabase.from('post_arguments').delete().in('post_id', postIds);
      await supabase.from('post_stocks').delete().in('post_id', postIds);
      await supabase.from('posts').delete().in('id', postIds);
    }
  }

  return score;
}
