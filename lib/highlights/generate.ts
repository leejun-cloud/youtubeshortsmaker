import type { Transcript, TranscriptSegment } from '../transcript/schema.js';

export interface HighlightCandidate {
  id: string;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
  hook: string;
  title: string;
  description: string;
  hashtags: string[];
  transcriptSegmentIds: string[];
  text: string;
}

export interface GenerateHighlightOptions {
  count?: number;
  targetDurationSec?: number;
  mode?: 'content' | 'hook';
  minGapSec?: number;
}

const hookPatterns = [
  /왜|어떻게|무엇|언제|진짜|절대|반드시|충격|비밀|문제|핵심|중요|결국|하지만|그런데|사실|모르면|해야|하지 마|하지마/,
  /\d+|%|퍼센트|가지|단계|분|초|원|배/,
  /\?|!/,
];

const contentPatterns: Array<{ pattern: RegExp; points: number; reason: string }> = [
  {
    pattern: /핵심|중요|본질|원리|기준|목표|목적|의미|정의|개념|구조/,
    points: 28,
    reason: '핵심 개념/원리 설명',
  },
  {
    pattern: /방법|전략|단계|프로세스|순서|계획|설계|실행|적용|활용|만드는|정하는/,
    points: 26,
    reason: '실행 방법/프로세스 포함',
  },
  {
    pattern: /예를 들면|예를 들어|사례|경우|프로젝트|업무|관계|품성|성과|문제/,
    points: 22,
    reason: '구체 사례/적용 맥락 포함',
  },
  {
    pattern: /왜냐하면|그래서|때문에|그러면|결국|따라서|즉|다시 말해/,
    points: 20,
    reason: '이유와 결론이 연결됨',
  },
  {
    pattern: /해야|하면|됩니다|해보세요|정리|체크|분명히|구체적으로|한 가지|세 가지|\d+\s*가지/,
    points: 18,
    reason: '실천 가능한 메시지 포함',
  },
];

const weakContentPatterns = [
  /여러분|생각했을 때|추측해 보세요|맞죠|그렇죠|아시겠죠|넘어가겠습니다/,
  /^(있어요|많이 있어요|좋아요|예|네|자)\b/,
];

const noisyCaptionPatterns = [
  /모를 잘 모르|잘 모르 설명/,
  /동기 부여가.*안 됐을 때.*동기 부여/,
  /왜\s+왜\s+왜/,
  /이게이|굉장히이|제가음/,
  /검색하기를 검색하기/,
];

const scoreText = (
  text: string,
  duration: number,
  mode: 'content' | 'hook'
): { score: number; reasons: string[] } => {
  const reasons: string[] = [];
  let score = 0;

  if (mode === 'hook') {
    for (const pattern of hookPatterns) {
      if (pattern.test(text)) score += 18;
    }
  } else {
    for (const item of contentPatterns) {
      if (item.pattern.test(text)) {
        score += item.points;
        reasons.push(item.reason);
      }
    }
  }

  if (/[.!?。？！]$/.test(text.trim())) {
    score += 8;
    reasons.push('문장 마무리가 자연스러움');
  }
  if (text.length >= 80 && text.length <= 420) {
    score += 18;
    reasons.push('쇼츠 길이에 맞는 정보량');
  }
  if (duration >= 18 && duration <= 62) {
    score += 16;
    reasons.push('60초 이하 쇼츠 길이');
  }

  if (mode === 'hook' && /왜|어떻게|진짜|핵심|중요|문제|사실|하지만|그런데/.test(text)) {
    reasons.push('후킹 표현 포함');
  }
  if (/\d+|%|가지|단계/.test(text)) {
    score += mode === 'content' ? 10 : 0;
    reasons.push('숫자/구체 표현 포함');
  }
  const repeated = repetitionRatio(text);
  if (repeated > 0.1) {
    score -= Math.round(repeated * 120);
    reasons.push('자동자막 반복 표현 감점');
  }
  for (const weak of weakContentPatterns) {
    if (weak.test(text)) score -= 8;
  }
  for (const noisy of noisyCaptionPatterns) {
    if (noisy.test(text)) {
      score -= 26;
      reasons.push('자동자막 오류 표현 감점');
    }
  }

  return { score, reasons };
};

const repetitionRatio = (text: string): number => {
  const tokens = text.split(/\s+/).filter((token) => token.length > 1);
  if (tokens.length < 12) return 0;
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const repeated = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return repeated / tokens.length;
};

const makeTitle = (text: string): string => {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。？！])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const first =
    sentences.find((sentence) => {
      if (/^(있어요|많이 있어요|예|네|자|그리고|그런데|그래서|이제|경우는요)\b/.test(sentence)) return false;
      if (sentence.length < 12) return false;
      return /핵심|중요|왜|목표|전략|프로젝트|설계|경험|결정|동기|이유|방법|원칙|성과/.test(sentence);
    }) ||
    sentences.find((sentence) => sentence.length >= 12) ||
    sentences[0] ||
    text.trim();
  return `${first.slice(0, 42)}${first.length > 42 ? '...' : ''} #Shorts`;
};

const windowSegments = (segments: TranscriptSegment[], targetDuration: number): TranscriptSegment[][] => {
  const windows: TranscriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const group: TranscriptSegment[] = [];
    for (let j = i; j < segments.length; j += 1) {
      group.push(segments[j]);
      const duration = group.at(-1)!.endSec - group[0].startSec;
      if (duration >= targetDuration * 0.7) {
        windows.push([...group]);
      }
      if (duration >= targetDuration * 1.15) break;
    }
  }
  return windows;
};

const trimWeakEdges = (segments: TranscriptSegment[]): TranscriptSegment[] => {
  let start = 0;
  let end = segments.length;
  const weakStart = /^(있어요|많이 있어요|예|네|자|그리고|그런데|그래서|이제)\b/;
  while (start < end - 1 && weakStart.test(segments[start].text.trim())) start += 1;
  while (end > start + 1 && segments[end - 1].text.trim().length < 8) end -= 1;
  return segments.slice(start, end);
};

const overlaps = (a: HighlightCandidate, b: HighlightCandidate): boolean => {
  const start = Math.max(a.startSec, b.startSec);
  const end = Math.min(a.endSec, b.endSec);
  return Math.max(0, end - start) > Math.min(a.endSec - a.startSec, b.endSec - b.startSec) * 0.45;
};

const tooClose = (a: HighlightCandidate, b: HighlightCandidate, minGapSec: number): boolean => {
  const centerA = (a.startSec + a.endSec) / 2;
  const centerB = (b.startSec + b.endSec) / 2;
  return Math.abs(centerA - centerB) < minGapSec;
};

export const generateHighlights = (
  transcript: Transcript,
  options: GenerateHighlightOptions = {}
): HighlightCandidate[] => {
  const count = options.count ?? 5;
  const targetDuration = options.targetDurationSec ?? 45;
  const mode = options.mode ?? 'content';
  const minGapSec = options.minGapSec ?? 180;
  const windows = windowSegments(transcript.segments, targetDuration);

  const candidates = windows
    .map((rawSegments, index): HighlightCandidate | null => {
      const segments = trimWeakEdges(rawSegments);
      if (segments.length === 0) {
        return null;
      }
      const startSec = Math.max(0, segments[0].startSec - 0.4);
      const endSec = Math.min(segments.at(-1)!.endSec + 0.4, startSec + 60);
      const text = segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
      const scored = scoreText(text, endSec - startSec, mode);
      return {
        id: `highlight-${String(index + 1).padStart(3, '0')}`,
        startSec,
        endSec,
        score: scored.score,
        reason: scored.reasons.join(', ') || '발화 밀도 기반 후보',
        hook: text.slice(0, 80),
        title: makeTitle(text),
        description: `${text.slice(0, 220)}${text.length > 220 ? '...' : ''}`,
        hashtags: ['#Shorts', '#쇼츠', '#하이라이트'],
        transcriptSegmentIds: segments.map((segment) => segment.id),
        text,
      };
    })
    .filter((candidate): candidate is HighlightCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score);

  const selected: HighlightCandidate[] = [];
  for (const candidate of candidates) {
    if (selected.some((existing) => overlaps(existing, candidate))) continue;
    if (selected.some((existing) => tooClose(existing, candidate, minGapSec))) continue;
    selected.push({ ...candidate, id: `short-${String(selected.length + 1).padStart(3, '0')}` });
    if (selected.length >= count) break;
  }

  return selected;
};
