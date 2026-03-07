import { getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/marketing/landing-nav';
import { HeroSection } from '@/components/marketing/hero-section';
import { PainPointsSection } from '@/components/marketing/pain-points-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { HowItWorksSection } from '@/components/marketing/how-it-works-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { FaqSection } from '@/components/marketing/faq-section';
import { FooterCtaSection } from '@/components/marketing/footer-cta-section';

export async function generateMetadata() {
  const t = await getTranslations('landing');
  return {
    title: t('hero.title'),
    description: t('hero.subtitle'),
  };
}

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <LandingNav />
      <HeroSection />
      <PainPointsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <FaqSection />
      <FooterCtaSection />
    </main>
  );
}
