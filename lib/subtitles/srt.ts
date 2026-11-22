import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptSegment } from '../transcript/schema.js';

const formatSrtTime = (seconds: number): string => {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
};

export const writeClipSrt = async (opts: {
  segments: TranscriptSegment[];
  startSec: number;
  endSec: number;
  outputPath: string;
}): Promise<string> => {
  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  const relevant = opts.segments.filter(
    (segment) => segment.endSec > opts.startSec && segment.startSec < opts.endSec
  );

  const body = relevant
    .map((segment, index) => {
      const start = Math.max(0, segment.startSec - opts.startSec);
      const end = Math.min(opts.endSec - opts.startSec, segment.endSec - opts.startSec);
      return [
        String(index + 1),
        `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
        segment.text,
      ].join('\n');
    })
    .join('\n\n');

  await writeFile(opts.outputPath, `${body}\n`, 'utf8');
  return opts.outputPath;
};
