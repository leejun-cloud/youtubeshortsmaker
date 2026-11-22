import { transcriptSchema, type Transcript, type TranscriptSegment } from './schema.js';

const FILLER_ONLY = /^(음+|어+|아+|예+|네+|자+|그+|그냥|이제|그러니까|저기|뭐|막|좀|그죠|그쵸|맞죠|아니죠|음\.?|어\.?|예\.?|네\.?)$/;
const FILLER_PREFIX = /^(자|예|네|음|어|아|그|이제|그러니까|저기|뭐|막|좀|그죠|그쵸|맞죠|아니죠)[,\s.]+/;
const INLINE_FILLERS = /(^|[\s,.!?。？！])(음+|어+|아+|예+|네+|저기|그러니까|뭐랄까|그죠|그쵸|맞죠|아니죠|예예|네네)(?=$|[\s,.!?。？！])/g;

const normalizeText = (text: string): string => {
  let cleaned = text
    .replace(/>>/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\([^)]*(?:음악|박수|웃음|Music|Applause|Laughter)[^)]*\)/gi, ' ')
    .replace(INLINE_FILLERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  while (FILLER_PREFIX.test(cleaned)) {
    cleaned = cleaned.replace(FILLER_PREFIX, '').trim();
  }

  return compactRepeatedPhrases(cleaned)
    .replace(/\s+([,.!?。？！])/g, '$1')
    .replace(/([,.!?。？！]){2,}/g, '$1')
    .trim();
};

const compactRepeatedPhrases = (text: string): string => {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return text;

  const result: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    let repeated = false;
    for (const size of [8, 7, 6, 5, 4, 3, 2]) {
      const prev = result.slice(-size).join(' ');
      const next = tokens.slice(i, i + size).join(' ');
      if (prev && prev === next) {
        i += size - 1;
        repeated = true;
        break;
      }
    }
    if (!repeated) result.push(tokens[i]);
  }

  return result.join(' ').trim();
};

const similarity = (a: string, b: string): number => {
  const left = new Set(a.split(/\s+/).filter(Boolean));
  const right = new Set(b.split(/\s+/).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.min(left.size, right.size);
};

const shouldDrop = (text: string, durationSec: number): boolean => {
  if (!text) return true;
  if (FILLER_ONLY.test(text)) return true;
  if (text.length <= 2) return true;
  if (durationSec > 3 && text.length <= 4) return true;
  return false;
};

export const cleanTranscript = (transcript: Transcript): Transcript => {
  const cleanedSegments: TranscriptSegment[] = [];

  for (const segment of transcript.segments) {
    const duration = segment.endSec - segment.startSec;
    const text = compactRepeatedPhrases(normalizeText(segment.text));
    if (shouldDrop(text, duration)) continue;

    const previous = cleanedSegments.at(-1);
    if (previous && similarity(previous.text, text) >= 0.92) {
      previous.endSec = Math.max(previous.endSec, segment.endSec);
      continue;
    }

    cleanedSegments.push({
      ...segment,
      id: `seg-${String(cleanedSegments.length + 1).padStart(5, '0')}`,
      text,
    });
  }

  return transcriptSchema.parse({
    ...transcript,
    segments: cleanedSegments,
    text: cleanedSegments.map((segment) => segment.text).join('\n'),
  });
};
