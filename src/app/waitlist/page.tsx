'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrumpetIcon } from '@/components/icons/trumpet-icon';
import { API_ROUTES } from '@/lib/constants/routes';
import { createClient } from '@/infrastructure/supabase/client';

export default function WaitlistPage() {
  const t = useTranslations('waitlist');
  const [position, setPosition] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API_ROUTES.WAITLIST_POSITION)
      .then((res) => res.json())
      .then((data) => {
        setPosition(data.position);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="bg-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
            <TrumpetIcon className="text-primary-foreground h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          ) : (
            <>
              <div className="text-muted-foreground flex items-center justify-center gap-2">
                <Clock className="h-5 w-5" />
                <span>{t('subtitle')}</span>
              </div>

              {position !== null && (
                <div className="bg-muted/50 rounded-lg border p-6">
                  <p className="text-muted-foreground text-sm">{t('positionLabel')}</p>
                  <p className="text-4xl font-bold">#{position}</p>
                  {total !== null && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t('totalWaiting', { total })}
                    </p>
                  )}
                </div>
              )}

              <p className="text-muted-foreground text-sm">{t('notifyMessage')}</p>

              <Button variant="outline" onClick={handleLogout} className="w-full">
                <LogOut className="mr-2 h-4 w-4" />
                {t('logout')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
