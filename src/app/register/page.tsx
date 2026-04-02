'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { TrumpetIcon } from '@/components/icons/trumpet-icon';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';
import { GoogleIcon } from '@/components/icons/google-icon';
import { BrandPanel } from '@/components/auth/brand-panel';

function RegisterForm() {
  const t = useTranslations('auth');
  const tWaitlist = useTranslations('waitlist');

  const { signUp, signInWithGoogle, loading, error } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [capacityStatus, setCapacityStatus] = useState<'open' | 'near_capacity' | 'full' | null>(
    null
  );

  useEffect(() => {
    fetch('/api/auth/capacity')
      .then((res) => res.json())
      .then((data) => setCapacityStatus(data.status))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password || !confirmPassword) {
      setFormError(t('register.errors.fillRequiredFields'));
      return;
    }

    if (password.length < 6) {
      setFormError(t('register.errors.passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setFormError(t('register.errors.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp(email, password, displayName || undefined);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('register.errors.registerFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('oauth.googleError'));
    }
  };

  const isLoading = loading || isSubmitting;
  const displayError = formError || error?.message;

  return (
    <div className="flex min-h-screen">
      {/* Left: Brand Panel (hidden on mobile) */}
      <BrandPanel />

      {/* Right: Auth Form */}
      <div className="bg-background flex w-full flex-col items-center justify-center p-6 md:w-1/2">
        <Card className="w-full max-w-md border-0 shadow-none md:border md:shadow-sm">
          <CardHeader className="space-y-1 text-center">
            <div className="bg-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg md:hidden">
              <TrumpetIcon className="text-primary-foreground h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold">{t('register.title')}</CardTitle>
            <CardDescription>{t('register.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {capacityStatus && capacityStatus !== 'open' && (
              <div
                className={`mb-4 rounded-lg border p-3 text-sm ${
                  capacityStatus === 'full'
                    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300'
                }`}
              >
                {capacityStatus === 'full'
                  ? tWaitlist('capacity.full')
                  : tWaitlist('capacity.nearCapacity')}
              </div>
            )}

            {displayError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              {t('oauth.continueWithGoogle')}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">{t('oauth.orDivider')}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">{t('register.displayName')}</Label>
                <div className="relative">
                  <User className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="displayName"
                    type="text"
                    placeholder={t('register.displayNamePlaceholder')}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  {t('register.email')} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('register.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  {t('register.password')} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('register.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t('register.confirmPassword')} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t('register.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('register.submitting')}
                  </>
                ) : (
                  t('register.submit')
                )}
              </Button>
            </form>

            <div className="text-muted-foreground mt-6 text-center text-sm">
              {t('register.hasAccount')}{' '}
              <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
                {t('register.loginNow')}
              </Link>
            </div>

            <p className="text-muted-foreground mt-4 text-center text-xs">
              {t('register.terms')}
              <Link href="/terms" className="underline">
                {t('register.termsLink')}
              </Link>
              {' & '}
              <Link href="/privacy" className="underline">
                {t('register.privacyLink')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
