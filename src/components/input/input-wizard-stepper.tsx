'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

/**
 * Branch-aware stepper. The unified `/input` page hosts three flows (text,
 * post-urls, profile-url), each with a distinct step sequence. The parent
 * component passes `branch` along with `currentStep`; for `idle` we fall back
 * to the generic four-step layout that matches the original stepper.
 */
export type WizardBranch = 'idle' | 'text' | 'post-urls' | 'profile';

interface InputWizardStepperProps {
  currentStep: WizardStep;
  branch?: WizardBranch;
}

const GENERIC_KEYS = ['input', 'processing', 'review', 'complete'] as const;
const TEXT_KEYS = ['input', 'processing', 'review', 'complete'] as const;
const URLS_KEYS = ['input', 'processing', 'review', 'complete'] as const;
const PROFILE_KEYS = ['input', 'discovering', 'selecting', 'processing', 'complete'] as const;

function keysFor(branch: WizardBranch): readonly string[] {
  switch (branch) {
    case 'text':
      return TEXT_KEYS;
    case 'post-urls':
      return URLS_KEYS;
    case 'profile':
      return PROFILE_KEYS;
    case 'idle':
    default:
      return GENERIC_KEYS;
  }
}

export function InputWizardStepper({ currentStep, branch = 'idle' }: InputWizardStepperProps) {
  const t = useTranslations('input.wizard');
  const keys = keysFor(branch);

  return (
    <div className="flex items-center justify-start gap-0">
      {keys.map((key, index) => {
        const stepNumber = (index + 1) as WizardStep;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;

        return (
          <div key={key} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground ring-primary/30 ring-2',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : stepNumber}
              </div>
              <span
                className={cn(
                  'text-sm whitespace-nowrap',
                  isCurrent && 'font-semibold',
                  !isCompleted && !isCurrent && 'text-muted-foreground'
                )}
              >
                {t(key)}
              </span>
            </div>

            {index < keys.length - 1 && (
              <div
                className={cn(
                  'mx-3 h-px w-8 sm:w-12',
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
