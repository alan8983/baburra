'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WizardStep = 1 | 2 | 3 | 4;

const STEP_KEYS = ['input', 'processing', 'review', 'complete'] as const;

interface InputWizardStepperProps {
  currentStep: WizardStep;
}

export function InputWizardStepper({ currentStep }: InputWizardStepperProps) {
  const t = useTranslations('input.wizard');

  return (
    <div className="flex items-center justify-center gap-0">
      {STEP_KEYS.map((key, index) => {
        const stepNumber = (index + 1) as WizardStep;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;

        return (
          <div key={key} className="flex items-center">
            {/* Step indicator */}
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

            {/* Connector line */}
            {index < STEP_KEYS.length - 1 && (
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
