'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TrendingUp, Loader2, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';

export default function ResetPasswordConfirmPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!password || !confirmPassword) {
      setFormError(t('resetPasswordConfirm.errors.fillAllFields'));
      return;
    }

    if (password.length < 6) {
      setFormError(t('resetPasswordConfirm.errors.passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setFormError(t('resetPasswordConfirm.errors.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => {
        router.push(ROUTES.LOGIN);
      }, 2000);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t('resetPasswordConfirm.errors.updateFailed')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="bg-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
            <TrendingUp className="text-primary-foreground h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('resetPasswordConfirm.title')}</CardTitle>
          <CardDescription>{t('resetPasswordConfirm.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">{t('resetPasswordConfirm.successTitle')}</p>
                  <p className="mt-1">{t('resetPasswordConfirm.successDescription')}</p>
                </div>
              </div>
              <Link href={ROUTES.LOGIN} className="block">
                <Button variant="outline" className="w-full">
                  {t('resetPassword.backToLogin')}
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {formError && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('resetPasswordConfirm.newPassword')}</Label>
                  <div className="relative">
                    <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="password"
                      type="password"
                      placeholder={t('resetPasswordConfirm.newPasswordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    {t('resetPasswordConfirm.confirmPassword')}
                  </Label>
                  <div className="relative">
                    <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder={t('resetPasswordConfirm.confirmPasswordPlaceholder')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('resetPasswordConfirm.submitting')}
                    </>
                  ) : (
                    t('resetPasswordConfirm.submit')
                  )}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
