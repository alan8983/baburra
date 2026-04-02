import { describe, it, expect } from 'vitest';
import { parseVttToText, parseSrtToText, parseTranscriptToText } from '../vtt-parser';

describe('parseVttToText', () => {
  it('parses VTT with timestamps and text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
Hello, welcome to the show.

00:00:05.500 --> 00:00:10.000
Today we discuss the markets.`;

    expect(parseVttToText(vtt)).toBe('Hello, welcome to the show. Today we discuss the markets.');
  });

  it('strips speaker voice tags', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
<v Host>Welcome to the podcast.</v>

00:00:06.000 --> 00:00:10.000
<v Guest>Thank you for having me.</v>`;

    expect(parseVttToText(vtt)).toBe('Welcome to the podcast. Thank you for having me.');
  });

  it('strips HTML-like formatting tags', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
This is <b>bold</b> and <i>italic</i> text.`;

    expect(parseVttToText(vtt)).toBe('This is bold and italic text.');
  });

  it('handles numeric cue identifiers', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
First line.

2
00:00:04.000 --> 00:00:06.000
Second line.`;

    expect(parseVttToText(vtt)).toBe('First line. Second line.');
  });

  it('returns empty string for empty input', () => {
    expect(parseVttToText('')).toBe('');
    expect(parseVttToText('   ')).toBe('');
  });

  it('handles malformed input gracefully', () => {
    const malformed = `not a real VTT file
just some random text
with multiple lines`;

    const result = parseVttToText(malformed);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('handles WEBVTT with NOTE blocks', () => {
    const vtt = `WEBVTT

NOTE This is a comment

00:00:01.000 --> 00:00:05.000
Actual content here.`;

    expect(parseVttToText(vtt)).toBe('Actual content here.');
  });
});

describe('parseSrtToText', () => {
  it('parses SRT with sequence numbers and timestamps', () => {
    const srt = `1
00:00:01,000 --> 00:00:05,000
Hello, welcome to the show.

2
00:00:05,500 --> 00:00:10,000
Today we discuss the markets.`;

    expect(parseSrtToText(srt)).toBe('Hello, welcome to the show. Today we discuss the markets.');
  });

  it('strips HTML tags from SRT', () => {
    const srt = `1
00:00:01,000 --> 00:00:05,000
This is <font color="#ffffff">colored</font> text.`;

    expect(parseSrtToText(srt)).toBe('This is colored text.');
  });

  it('returns empty string for empty input', () => {
    expect(parseSrtToText('')).toBe('');
    expect(parseSrtToText('   ')).toBe('');
  });

  it('handles malformed input gracefully', () => {
    const result = parseSrtToText('just plain text without any structure');
    expect(typeof result).toBe('string');
  });
});

describe('parseTranscriptToText', () => {
  it('routes VTT to parseVttToText', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
VTT content.`;

    expect(parseTranscriptToText(vtt, 'text/vtt')).toBe('VTT content.');
  });

  it('routes SRT to parseSrtToText', () => {
    const srt = `1
00:00:01,000 --> 00:00:05,000
SRT content.`;

    expect(parseTranscriptToText(srt, 'application/srt')).toBe('SRT content.');
  });

  it('routes application/x-subrip to parseSrtToText', () => {
    const srt = `1
00:00:01,000 --> 00:00:05,000
SubRip content.`;

    expect(parseTranscriptToText(srt, 'application/x-subrip')).toBe('SubRip content.');
  });

  it('passes plain text through with whitespace collapse', () => {
    expect(parseTranscriptToText('  hello   world  ', 'text/plain')).toBe('hello world');
  });
});
