'use client';

import { useTranslations } from 'next-intl';
import { Link2, ListChecks, Cog, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ScrapeStep = 1 | 2 | 3 | 4;

const STEP_ICONS = [Link2, ListChecks, Cog, CheckCircle2] as const;
const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;

interface ScrapeFlowChartProps {
  currentStep: ScrapeStep;
  error?: boolean;
}

export function ScrapeFlowChart({ currentStep, error }: ScrapeFlowChartProps) {
  const t = useTranslations('scrape.flowChart');

  return (
    <div className="flex items-center justify-center gap-0">
      {STEP_KEYS.map((key, index) => {
        const stepNumber = (index + 1) as ScrapeStep;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const isError = isCurrent && error;
        const Icon = STEP_ICONS[index];

        return (
          <div key={key} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent &&
                    !isError &&
                    'bg-primary text-primary-foreground ring-primary/30 ring-2',
                  isCurrent && !isError && 'animate-pulse',
                  isError &&
                    'bg-destructive text-destructive-foreground ring-destructive/30 ring-2',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'hidden text-xs whitespace-nowrap sm:inline',
                  isCurrent && 'font-semibold',
                  isError && 'text-destructive font-semibold',
                  !isCompleted && !isCurrent && 'text-muted-foreground'
                )}
              >
                {t(key)}
              </span>
            </div>

            {index < STEP_KEYS.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-px w-6 sm:mx-3 sm:w-8',
                  stepNumber < currentStep ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
