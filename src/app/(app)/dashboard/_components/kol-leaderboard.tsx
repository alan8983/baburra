'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Trophy, User, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ROUTES } from '@/lib/constants';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { getStaggerClass } from '@/lib/animations';
import type { PostWithPriceChanges } from '@/domain/models';

interface KolLeaderboardProps {
  posts: PostWithPriceChanges[];
}

interface KolRank {
  id: string;
  name: string;
  avatarUrl: string | null;
  winRate: number | null;
  totalCalls: number;
  winCount: number;
}

export function KolLeaderboard({ posts }: KolLeaderboardProps) {
  const t = useTranslations('dashboard');
  const { colors } = useColorPalette();

  const rankings = useMemo(() => {
    const kolMap = new Map<
      string,
      {
        id: string;
        name: string;
        avatarUrl: string | null;
        wins: number;
        total: number;
      }
    >();

    for (const post of posts) {
      if (post.sentiment === 0) continue;
      for (const stock of post.stocks) {
        const pc = post.priceChanges?.[stock.id];
        if (!pc) continue;
        const change = pc.day30 ?? pc.day5 ?? null;
        if (change === null) continue;

        if (!kolMap.has(post.kol.id)) {
          kolMap.set(post.kol.id, {
            id: post.kol.id,
            name: post.kol.name,
            avatarUrl: post.kol.avatarUrl,
            wins: 0,
            total: 0,
          });
        }
        const entry = kolMap.get(post.kol.id)!;
        entry.total++;
        const effectiveSentiment = stock.sentiment ?? post.sentiment;
        if ((effectiveSentiment > 0 && change > 0) || (effectiveSentiment < 0 && change < 0)) {
          entry.wins++;
        }
      }
    }

    const result: KolRank[] = [];
    for (const [, entry] of kolMap) {
      result.push({
        id: entry.id,
        name: entry.name,
        avatarUrl: entry.avatarUrl,
        winRate: entry.total > 0 ? (entry.wins / entry.total) * 100 : null,
        totalCalls: entry.total,
        winCount: entry.wins,
      });
    }

    return result.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1)).slice(0, 5);
  }, [posts]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Trophy className="h-4 w-4 text-yellow-500" />
          {t('leaderboard.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rankings.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t('leaderboard.noData')}
          </p>
        ) : (
          <div className="space-y-1">
            {rankings.map((kol, i) => (
              <Link
                key={kol.id}
                href={ROUTES.KOL_DETAIL(kol.id)}
                className={`hover:bg-muted flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors ${getStaggerClass(i)}`}
              >
                <span className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {i + 1}
                </span>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={kol.avatarUrl || undefined} />
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{kol.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {kol.winCount}/{kol.totalCalls} {t('leaderboard.calls')}
                  </p>
                </div>
                {kol.winRate !== null ? (
                  <span
                    className={`text-sm font-bold ${
                      kol.winRate >= 50 ? colors.bullish.text : colors.bearish.text
                    }`}
                  >
                    {kol.winRate.toFixed(1)}%
                  </span>
                ) : (
                  <Clock className="text-muted-foreground h-4 w-4" />
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
