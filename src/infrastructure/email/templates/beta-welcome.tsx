import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Link,
} from '@react-email/components';

interface BetaWelcomeProps {
  scrapeUrl: string;
  feedbackUrl?: string;
}

export function BetaWelcomeEmail({
  scrapeUrl,
  feedbackUrl = 'https://github.com/alan8983/investment-idea-monitor/issues',
}: BetaWelcomeProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>Welcome to Baburra.io!</Heading>
            <Hr style={hr} />
            <Text style={text}>You&apos;re in the open beta! Here&apos;s what you get:</Text>
            <Text style={feature}>
              <strong>5,000 credits/week</strong> — enough for hours of YouTube transcription
            </Text>
            <Text style={feature}>
              <strong>All features unlocked</strong> — AI argument analysis, KOL comparison, and
              more
            </Text>
            <Text style={feature}>
              <strong>Track up to 50 KOLs</strong> — subscribe and auto-import new content
            </Text>
            <Section style={ctaSection}>
              <Link href={scrapeUrl} style={cta}>
                Start importing KOL content
              </Link>
            </Section>
            <Text style={text}>
              Got feedback or found a bug?{' '}
              <Link href={feedbackUrl} style={link}>
                Let us know
              </Link>
              .
            </Text>
            <Hr style={hr} />
            <Text style={footer}>Baburra.io — Track KOL investment ideas and measure accuracy</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default BetaWelcomeEmail;

const main = { backgroundColor: '#f6f9fc', fontFamily: 'sans-serif' };
const container = { margin: '0 auto', padding: '40px 20px', maxWidth: '560px' };
const section = { backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px' };
const heading = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
  margin: '0 0 16px',
};
const hr = { borderColor: '#e6ebf1', margin: '24px 0' };
const text = { fontSize: '14px', lineHeight: '24px', color: '#525f7f' };
const feature = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#525f7f',
  paddingLeft: '12px',
  borderLeft: '3px solid #22c55e',
  margin: '8px 0',
};
const ctaSection = { textAlign: 'center' as const, padding: '16px 0' };
const cta = {
  backgroundColor: '#1a1a1a',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
};
const link = { color: '#1a1a1a', textDecoration: 'underline' };
const footer = { fontSize: '12px', color: '#8898aa', textAlign: 'center' as const };
