import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../utils/run.js';
import type { HighlightCandidate } from '../highlights/generate.js';

export interface ThumbnailCandidate {
  id: string;
  style: 'shock' | 'question' | 'benefit';
  frameSec: number;
  headline: string;
  subline?: string;
  score: number;
  reason: string;
  imagePath: string;
}

const makeCopy = (candidate: HighlightCandidate, style: ThumbnailCandidate['style']): string => {
  const text = candidate.text;
  if (style === 'question') {
    const question = text.match(/[^.!?。？！]*(왜|어떻게|무엇|진짜|가능)[^.!?。？！]*/)?.[0]?.trim();
    return (question || '왜 이게 중요할까?').slice(0, 18);
  }
  if (style === 'benefit') {
    return (text.match(/\d+[^.!?。？！]{0,12}/)?.[0]?.trim() || '핵심만 뽑았습니다').slice(0, 18);
  }
  return (text.match(/[^.!?。？！]*(충격|비밀|절대|진짜|하지만|그런데|사실)[^.!?。？！]*/)?.[0]?.trim() || candidate.hook).slice(0, 18);
};

export const renderThumbnails = async (opts: {
  sourcePath: string;
  candidate: HighlightCandidate;
  outputDir: string;
}): Promise<ThumbnailCandidate[]> => {
  await mkdir(opts.outputDir, { recursive: true });
  const styles: ThumbnailCandidate['style'][] = ['shock', 'question', 'benefit'];
  const variants: ThumbnailCandidate[] = [];

  for (const [index, style] of styles.entries()) {
    const frameSec = opts.candidate.startSec + Math.max(1, (opts.candidate.endSec - opts.candidate.startSec) * (0.25 + index * 0.2));
    const headline = makeCopy(opts.candidate, style);
    const imagePath = path.join(opts.outputDir, `thumbnail-${String(index + 1).padStart(3, '0')}.png`);
    const vf = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'eq=contrast=1.12:brightness=-0.04:saturation=1.18',
    ].join(',');

    await run('ffmpeg', [
      '-y',
      '-ss',
      String(frameSec),
      '-i',
      opts.sourcePath,
      '-frames:v',
      '1',
      '-vf',
      vf,
      imagePath,
    ], true);

    variants.push({
      id: `thumb-${String(index + 1).padStart(3, '0')}`,
      style,
      frameSec,
      headline,
      subline: opts.candidate.title.replace(/#Shorts/i, '').trim().slice(0, 24),
      score: opts.candidate.score + (style === 'shock' ? 8 : style === 'question' ? 6 : 4),
      reason: `${style} 후킹 패턴`,
      imagePath,
    });
  }

  await writeFile(path.join(opts.outputDir, 'thumbnail.json'), JSON.stringify(variants, null, 2), 'utf8');
  return variants;
};
