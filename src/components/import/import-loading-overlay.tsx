'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

const STEP_INTERVAL_MS = 2500;
const STEP_KEYS = [
  'checkingQuota',
  'creatingKol',
  'extractingContent',
  'aiAnalyzing',
  'extractingArguments',
  'creatingPosts',
  'finishing',
] as const;

interface ImportLoadingOverlayProps {
  isVisible: boolean;
}

export function ImportLoadingOverlay({ isVisible }: ImportLoadingOverlayProps) {
  if (!isVisible) return null;
  return createPortal(<OverlayContent />, document.body);
}

/** Inner component — mounts fresh each time, so step state auto-resets to 0. */
function OverlayContent() {
  const t = useTranslations('import.loadingOverlay');
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < STEP_KEYS.length - 1 ? prev + 1 : prev));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/80 duration-300"
      onKeyDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      role="alert"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-6 text-white">
        <Loader2 className="h-12 w-12 animate-spin" />

        <div className="text-center">
          <h2 className="text-xl font-semibold">{t('title')}</h2>
          <p className="mt-2 animate-pulse text-sm text-white/70">
            {t(`steps.${STEP_KEYS[currentStep]}`)}
          </p>
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full bg-white/60"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>

        {/* Progress dots */}
        <div className="flex gap-2">
          {STEP_KEYS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                i <= currentStep ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
