/**
 * VTT/SRT Parser — strips timestamps and speaker labels from transcript files
 * into plain text for AI analysis.
 */

/**
 * Parse WebVTT content to plain text.
 * Strips WEBVTT header, timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm),
 * speaker labels (<v Speaker>), and cue settings.
 */
export function parseVttToText(vttContent: string): string {
  if (!vttContent.trim()) return '';

  const lines = vttContent.split(/\r?\n/);
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip WEBVTT header and metadata
    if (trimmed.startsWith('WEBVTT')) continue;
    if (trimmed.startsWith('NOTE')) continue;
    if (trimmed.startsWith('STYLE')) continue;

    // Skip timestamp lines (e.g., "00:00:01.000 --> 00:00:05.000")
    if (/^\d{2}:\d{2}[:.]\d{2}[.,]\d{3}\s*-->/.test(trimmed)) continue;

    // Skip numeric cue identifiers
    if (/^\d+$/.test(trimmed)) continue;

    // Skip empty lines
    if (!trimmed) continue;

    // Strip VTT voice tags: <v Speaker Name>text</v> → text
    let text = trimmed.replace(/<v\s+[^>]*>/gi, '').replace(/<\/v>/gi, '');

    // Strip other HTML-like tags (bold, italic, etc.)
    text = text.replace(/<[^>]+>/g, '');

    // Strip leading "Speaker:" labels (common in some VTT files)
    text = text.replace(/^[A-Za-z0-9\s]+:\s*/, (match) => {
      // Only strip if it looks like a speaker label (short prefix before colon)
      return match.length <= 30 ? '' : match;
    });

    if (text.trim()) {
      textLines.push(text.trim());
    }
  }

  return collapseWhitespace(textLines.join(' '));
}

/**
 * Parse SRT (SubRip) content to plain text.
 * Strips sequence numbers, timestamps, and formatting tags.
 */
export function parseSrtToText(srtContent: string): string {
  if (!srtContent.trim()) return '';

  const lines = srtContent.split(/\r?\n/);
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip sequence numbers
    if (/^\d+$/.test(trimmed)) continue;

    // Skip timestamp lines (e.g., "00:00:01,000 --> 00:00:05,000")
    if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(trimmed)) continue;

    // Skip empty lines
    if (!trimmed) continue;

    // Strip HTML-like formatting tags
    const text = trimmed.replace(/<[^>]+>/g, '');

    if (text.trim()) {
      textLines.push(text.trim());
    }
  }

  return collapseWhitespace(textLines.join(' '));
}

/**
 * Route to appropriate parser based on MIME type.
 */
export function parseTranscriptToText(
  content: string,
  type: 'text/vtt' | 'application/srt' | 'text/plain' | 'application/x-subrip'
): string {
  switch (type) {
    case 'text/vtt':
      return parseVttToText(content);
    case 'application/srt':
    case 'application/x-subrip':
      return parseSrtToText(content);
    case 'text/plain':
      return collapseWhitespace(content.trim());
    default:
      return collapseWhitespace(content.trim());
  }
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
