import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { PerformanceMetricsPopover } from '../performance-metrics-popover';
import type { WinRateBucket } from '@/domain/calculators';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    // Map common keys to stable labels so assertions can target them.
    const labels: Record<string, string> = {
      title: 'Performance',
      sqr: 'SQR',
      precision: 'Precision',
      avgExcessWin: 'Avg Win',
      avgExcessLose: 'Avg Lose',
      threshold: 'Threshold',
      detailsTrigger: 'Details',
      'sqrLabel.none': '—',
      'sqrLabel.excellent': 'Excellent',
      'sqrLabel.decent': 'Decent',
      'sqrLabel.unstable': 'Unstable',
      sqrExplainer: 'SQR explainer.',
    };
    return labels[key] ?? key;
  },
}));

function renderPopoverOpen(bucket: WinRateBucket | null) {
  const { container } = render(<PerformanceMetricsPopover bucket={bucket} />);
  const trigger = within(container).getByRole('button', { name: 'Details' });
  // Radix PopoverTrigger expects pointerdown + click; fireEvent.click alone
  // doesn't open it. Use a full synthetic pointerdown → pointerup → click.
  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
  fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' });
  fireEvent.click(trigger);
  return container;
}

describe('PerformanceMetricsPopover — SQR rendering', () => {
  it('renders a single em-dash and no `· label` when SQR is null', () => {
    const bucket: WinRateBucket = {
      total: 5,
      winCount: 2,
      loseCount: 2,
      noiseCount: 1,
      excludedCount: 0,
      wins: 2,
      noise: 1,
      loses: 2,
      hitRate: null,
      precision: null,
      avgExcessWin: null,
      avgExcessLose: null,
      sqr: null,
      avgReturn: null,
      returnSampleSize: 0,
      pendingCount: 0,
      sufficientData: false,
      threshold: null,
    };
    renderPopoverOpen(bucket);

    // The SQR row contains the em-dash value but must NOT show a
    // `· <label>` suffix when the value is null. Asserting by scanning
    // the whole document's text is cheaper than probing ARIA refs.
    const text = document.body.textContent ?? '';
    // Exactly one occurrence of `· ` (from the explainer line ending)
    // is fine; what we're preventing is the literal `— · —` artifact.
    expect(text).not.toContain('— · —');
    // The SQR row itself renders the value as a standalone em-dash.
    expect(text).toContain('SQR');
    expect(text).toContain('—');
  });

  it('renders the qualitative label beside the value when SQR is non-null', () => {
    const bucket: WinRateBucket = {
      total: 20,
      winCount: 12,
      loseCount: 6,
      noiseCount: 2,
      excludedCount: 0,
      wins: 12,
      noise: 2,
      loses: 6,
      hitRate: 0.6,
      precision: 0.666,
      avgExcessWin: 1.5,
      avgExcessLose: -1.2,
      sqr: 1.3,
      avgReturn: 2.1,
      returnSampleSize: 20,
      pendingCount: 0,
      sufficientData: true,
      threshold: { value: 0.05, source: 'ticker' },
    };
    renderPopoverOpen(bucket);
    const text = document.body.textContent ?? '';
    expect(text).toContain('1.30');
    expect(text).toContain('· Excellent');
  });
});
