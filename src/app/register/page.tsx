'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { TrumpetIcon } from '@/components/icons/trumpet-icon';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES, API_ROUTES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';
import { GoogleIcon } from '@/components/icons/google-icon';
import { getVariantFromCookie, AB_EXPERIMENTS } from '@/lib/ab-test';

function RegisterForm() {
  const t = useTranslations('auth');
  const tWelcome = useTranslations('welcome');
  const searchParams = useSearchParams();
  const isFromWelcome = searchParams.get('from') === 'welcome';

  const {
    signUp,
    signInWithGoogle,
    convertAnonymousToEmail,
    convertAnonymousToGoogle,
    isAnonymous,
    loading,
    error,
  } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Track AB conversion event (fire-and-forget)
  const trackConversion = async (userId?: string) => {
    const variant = getVariantFromCookie();
    if (!variant) return;
    try {
      await fetch(API_ROUTES.AB_EVENTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experiment: AB_EXPERIMENTS.ONBOARDING_BEFORE_REG,
          variant,
          userId,
          event: 'converted',
        }),
      });
    } catch {
      /* non-critical */
    }
  };

  // Mark onboarding as completed for variant B users (they already did it)
  const markOnboardingDone = async () => {
    try {
      await fetch(API_ROUTES.PROFILE_ONBOARDING, { method: 'POST' });
    } catch {
      /* non-critical */
    }
  };

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
      if (isAnonymous && isFromWelcome) {
        await convertAnonymousToEmail(email, password, displayName || undefined);
        await markOnboardingDone();
        await trackConversion();
      } else {
        await signUp(email, password, displayName || undefined);
        await trackConversion();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('register.errors.registerFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    try {
      if (isAnonymous && isFromWelcome) {
        await convertAnonymousToGoogle();
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('oauth.googleError'));
    }
  };

  const isLoading = loading || isSubmitting;
  const displayError = formError || error?.message;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="bg-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
          <TrumpetIcon className="text-primary-foreground h-6 w-6" />
        </div>
        <CardTitle className="text-2xl font-bold">{t('register.title')}</CardTitle>
        <CardDescription>{t('register.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isFromWelcome && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{tWelcome('register.dataPreserved')}</span>
          </div>
        )}

        {displayError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}
