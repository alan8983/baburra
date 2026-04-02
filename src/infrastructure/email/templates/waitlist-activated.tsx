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

interface WaitlistActivatedProps {
  loginUrl: string;
}

export function WaitlistActivatedEmail({ loginUrl }: WaitlistActivatedProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>Baburra.io</Heading>
            <Hr style={hr} />
            <Text style={highlight}>You&apos;re in!</Text>
            <Text style={text}>
              A spot has opened up in the Baburra.io open beta. Your account is now active!
            </Text>
            <Text style={text}>
              During the beta, you get <strong>5,000 credits/week</strong> and full access to all
              features — no restrictions.
            </Text>
            <Section style={ctaSection}>
              <Link href={loginUrl} style={cta}>
                Log in to Baburra.io
              </Link>
            </Section>
            <Hr style={hr} />
            <Text style={footer}>Baburra.io — Track KOL investment ideas and measure accuracy</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WaitlistActivatedEmail;

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
const highlight = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#22c55e',
  textAlign: 'center' as const,
  padding: '8px 0',
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
const footer = { fontSize: '12px', color: '#8898aa', textAlign: 'center' as const };
