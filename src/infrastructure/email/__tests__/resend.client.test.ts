import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';

describe('sendEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns failure when RESEND_API_KEY is not set', async () => {
    // The module reads env at import time, so we need resetModules
    vi.resetModules();
    vi.stubEnv('RESEND_API_KEY', '');

    const { sendEmail } = await import('../resend.client');
    const result = await sendEmail('test@example.com', 'Test', createElement('div'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY not configured');
  });

  it('catches exceptions and returns failure without throwing', async () => {
    vi.resetModules();
    vi.stubEnv('RESEND_API_KEY', 'test-key');

    // Mock Resend constructor to throw
    vi.doMock('resend', () => ({
      Resend: class {
        constructor() {
          throw new Error('Connection failed');
        }
      },
    }));

    const { sendEmail } = await import('../resend.client');
    const result = await sendEmail('test@example.com', 'Test', createElement('div'));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection failed');
  });
});
