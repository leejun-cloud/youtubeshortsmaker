import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { transcriptSchema, type Transcript, type TranscriptSegment } from './schema.js';

export interface ParseSubtitleOptions {
  subtitlePath: string;
  sourcePath: string;
  language?: string;
  engine?: 'youtube-captions' | 'manual-subtitle';
  model?: string;
}

const stripTags = (text: string): string => {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const parseTimestamp = (value: string): number => {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid subtitle timestamp: ${value}`);
  }

  const secondsPart = Number(parts.at(-1));
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if ([secondsPart, minutes, hours].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid subtitle timestamp: ${value}`);
  }

  return hours * 3600 + minutes * 60 + secondsPart;
};

const parseBlocks = (content: string): TranscriptSegment[] => {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^WEBVTT.*?(\n\n|$)/s, '')
    .replace(/^Kind:.*$/gm, '')
    .replace(/^Language:.*$/gm, '');

  const segments: TranscriptSegment[] = [];
  const blocks = normalized.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;

    const timing = lines[timingIndex];
    const match = timing.match(
      /(?<start>\d{1,2}:\d{2}(?::\d{2})?[\.,]\d{1,3}|\d{1,2}:\d{2}(?::\d{2})?)\s*-->\s*(?<end>\d{1,2}:\d{2}(?::\d{2})?[\.,]\d{1,3}|\d{1,2}:\d{2}(?::\d{2})?)/
    );
    if (!match?.groups) continue;

    const text = stripTags(lines.slice(timingIndex + 1).join(' '));
    if (!text) continue;

    const startSec = parseTimestamp(match.groups.start);
    const endSec = parseTimestamp(match.groups.end);
    if (endSec <= startSec) continue;

    const previous = segments.at(-1);
    if (previous && previous.startSec === startSec && previous.endSec === endSec) {
      previous.text = stripTags(`${previous.text} ${text}`);
      continue;
    }

    segments.push({
      id: `seg-${String(segments.length + 1).padStart(5, '0')}`,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
      text,
    });
  }

  return segments;
};

export const parseSubtitleFile = async (
  options: ParseSubtitleOptions
): Promise<Transcript> => {
  const subtitlePath = path.resolve(options.subtitlePath);
  const sourcePath = options.sourcePath;
  const raw = await readFile(subtitlePath, 'utf8');
  const segments = parseBlocks(raw);
  if (segments.length === 0) {
    throw new Error(`No subtitle segments parsed from ${subtitlePath}`);
  }

  return transcriptSchema.parse({
    sourcePath,
    language: options.language || 'ko',
    createdAt: new Date().toISOString(),
    engine: options.engine || 'manual-subtitle',
    model: options.model || path.extname(subtitlePath).slice(1) || 'subtitle',
    segments,
    text: segments.map((segment) => segment.text).join('\n'),
  });
};
