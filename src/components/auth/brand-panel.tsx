'use client';

import { TrumpetIcon } from '@/components/icons/trumpet-icon';

/**
 * Decorative brand panel for auth pages.
 * Shows on md+ viewports only (hidden on mobile).
 */
export function BrandPanel() {
  return (
    <div className="bg-primary text-primary-foreground relative hidden flex-col items-center justify-center overflow-hidden md:flex md:w-1/2">
      {/* Gradient mesh background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,oklch(0.35_0.15_260)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,oklch(0.30_0.12_200)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_80%,oklch(0.25_0.10_280)_0%,transparent_50%)]" />
      </div>

      {/* Abstract chart lines */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.08]"
        viewBox="0 0 400 600"
        fill="none"
        preserveAspectRatio="none"
      >
        <polyline
          points="0,400 50,380 100,350 150,370 200,300 250,320 300,280 350,260 400,290"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <polyline
          points="0,450 50,440 100,420 150,450 200,380 250,400 300,360 350,340 400,370"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <polyline
          points="0,300 80,280 160,310 240,250 320,270 400,230"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
        />
      </svg>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
          <TrumpetIcon className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Baburra.io</h1>
          <p className="text-primary-foreground/70 mt-2 max-w-[280px] text-sm">
            Track KOL investment opinions. Measure accuracy. Make better decisions.
          </p>
        </div>

        {/* Feature pills */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {['Backtesting', 'Win Rate', 'K-Line Charts', 'AI Analysis'].map((feature) => (
            <span
              key={feature}
              className="border-primary-foreground/20 rounded-full border bg-white/5 px-3 py-1 text-xs backdrop-blur-sm"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
