import { Html, Head, Body, Container, Section, Text, Heading, Hr } from '@react-email/components';

interface WaitlistConfirmProps {
  position: number;
}

export function WaitlistConfirmEmail({ position }: WaitlistConfirmProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>Baburra.io</Heading>
            <Hr style={hr} />
            <Text style={text}>
              Thanks for signing up for Baburra.io! Our open beta is currently at capacity.
            </Text>
            <Text style={highlight}>You are #{position} in the waitlist queue.</Text>
            <Text style={text}>
              We&apos;ll notify you by email as soon as a spot opens up. You don&apos;t need to do
              anything — just sit tight!
            </Text>
            <Hr style={hr} />
            <Text style={footer}>Baburra.io — Track KOL investment ideas and measure accuracy</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WaitlistConfirmEmail;

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
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
  textAlign: 'center' as const,
  padding: '16px 0',
};
const footer = { fontSize: '12px', color: '#8898aa', textAlign: 'center' as const };
