import { describe, it, expect } from 'vitest';
import { parseInputContent } from '../parse-input-content';

describe('parseInputContent', () => {
  describe('empty input', () => {
    it('returns mode "empty" for empty string', () => {
      const result = parseInputContent('');
      expect(result.mode).toBe('empty');
      expect(result.urls).toEqual([]);
      expect(result.hasUnsupportedUrls).toBe(false);
      expect(result.segments).toEqual([]);
    });

    it('returns mode "empty" for whitespace-only string', () => {
      expect(parseInputContent('   ').mode).toBe('empty');
    });

    it('returns mode "empty" for only delimiters', () => {
      expect(parseInputContent(';\n;\n').mode).toBe('empty');
    });
  });

  describe('single URL input', () => {
    it('returns mode "urls" for a supported Twitter URL', () => {
      const result = parseInputContent('https://x.com/user/status/123');
      expect(result.mode).toBe('urls');
      expect(result.urls).toEqual(['https://x.com/user/status/123']);
      expect(result.hasUnsupportedUrls).toBe(false);
    });

    it('returns mode "urls" for a supported YouTube URL', () => {
      const result = parseInputContent('https://youtube.com/watch?v=abc');
      expect(result.mode).toBe('urls');
      expect(result.urls).toEqual(['https://youtube.com/watch?v=abc']);
    });

    it('returns mode "text" for an unsupported URL with hasUnsupportedUrls=true', () => {
      const result = parseInputContent('https://facebook.com/post/123');
      expect(result.mode).toBe('text');
      expect(result.hasUnsupportedUrls).toBe(true);
      expect(result.urls).toEqual([]);
    });

    it('returns mode "text" for a non-URL string', () => {
      const result = parseInputContent('buy AAPL now');
      expect(result.mode).toBe('text');
      expect(result.urls).toEqual([]);
      expect(result.hasUnsupportedUrls).toBe(false);
    });
  });

  describe('multiple URLs separated by semicolons', () => {
    it('returns mode "urls" when all are supported platforms', () => {
      const input = 'https://x.com/user/status/1;https://youtube.com/watch?v=abc';
      const result = parseInputContent(input);
      expect(result.mode).toBe('urls');
      expect(result.urls).toHaveLength(2);
    });

    it('returns mode "text" when mix of supported and unsupported URLs', () => {
      const input = 'https://x.com/user/status/1;https://facebook.com/post/123';
      const result = parseInputContent(input);
      expect(result.mode).toBe('text');
      expect(result.hasUnsupportedUrls).toBe(true);
      expect(result.urls).toEqual(['https://x.com/user/status/1']);
    });
  });

  describe('multiple URLs separated by newlines', () => {
    it('returns mode "urls" when all are supported', () => {
      const input = 'https://x.com/user/status/1\nhttps://youtube.com/watch?v=abc';
      const result = parseInputContent(input);
      expect(result.mode).toBe('urls');
      expect(result.urls).toHaveLength(2);
    });

    it('handles \\r\\n line endings', () => {
      const input = 'https://x.com/user/status/1\r\nhttps://youtube.com/watch?v=abc';
      // \r is not a split character, so segment will be "https://x.com/user/status/1\r"
      // which may or may not be recognized as a URL. Test current behavior:
      const result = parseInputContent(input);
      // The \r stays attached but isUrlLike trims, and the regex tests for /^https?:\/\/\S+/
      // \r is not whitespace in the URL regex sense, but trim() removes it
      expect(result.urls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('mixed content (URLs + text)', () => {
    it('returns mode "text" when mix of URLs and plain text', () => {
      const input = 'https://x.com/user/status/1\nbuy AAPL now';
      const result = parseInputContent(input);
      expect(result.mode).toBe('text');
    });

    it('still populates urls array with supported URLs found', () => {
      const input = 'https://x.com/user/status/1\nbuy AAPL now';
      const result = parseInputContent(input);
      expect(result.urls).toEqual(['https://x.com/user/status/1']);
    });

    it('sets hasUnsupportedUrls when mixed with unsupported URLs', () => {
      const input = 'https://facebook.com/post/123\nbuy AAPL';
      const result = parseInputContent(input);
      expect(result.mode).toBe('text');
      expect(result.hasUnsupportedUrls).toBe(true);
    });
  });

  describe('segments', () => {
    it('assigns correct isUrl flag per segment', () => {
      const input = 'https://x.com/user/status/1\nbuy AAPL';
      const result = parseInputContent(input);
      expect(result.segments[0].isUrl).toBe(true);
      expect(result.segments[1].isUrl).toBe(false);
    });

    it('assigns correct platform per segment', () => {
      const input = 'https://x.com/user/status/1;https://youtube.com/watch?v=abc';
      const result = parseInputContent(input);
      expect(result.segments[0].platform).toBe('Twitter / X');
      expect(result.segments[1].platform).toBe('YouTube');
    });

    it('assigns null platform for non-URLs and unsupported URLs', () => {
      const input = 'https://facebook.com/post;buy AAPL';
      const result = parseInputContent(input);
      expect(result.segments[0].platform).toBeNull(); // unsupported URL
      expect(result.segments[1].platform).toBeNull(); // plain text
    });

    it('trims whitespace from segments', () => {
      const input = '  https://x.com/user/status/1  ;  buy AAPL  ';
      const result = parseInputContent(input);
      expect(result.segments[0].text).toBe('https://x.com/user/status/1');
      expect(result.segments[1].text).toBe('buy AAPL');
    });
  });

  describe('edge cases', () => {
    it('handles trailing semicolons', () => {
      const result = parseInputContent('https://x.com/user/status/1;');
      expect(result.mode).toBe('urls');
      expect(result.urls).toHaveLength(1);
    });

    it('handles duplicate URLs', () => {
      const input = 'https://x.com/user/status/1;https://x.com/user/status/1';
      const result = parseInputContent(input);
      expect(result.segments).toHaveLength(2);
      expect(result.urls).toHaveLength(2);
    });

    it('handles single non-URL text', () => {
      const result = parseInputContent('AAPL is going to moon 🚀');
      expect(result.mode).toBe('text');
      expect(result.urls).toEqual([]);
      expect(result.segments).toHaveLength(1);
    });
  });
});
