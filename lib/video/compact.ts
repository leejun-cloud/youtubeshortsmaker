import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../utils/run.js';
import type { TranscriptSegment } from '../transcript/schema.js';

export interface ClipInterval {
  startSec: number;
  endSec: number;
}

export interface CompactClipResult {
  outputPath: string;
  durationSec: number;
  segments: TranscriptSegment[];
}

export const buildSpeechIntervals = (
  segments: TranscriptSegment[],
  startSec: number,
  endSec: number
): ClipInterval[] => {
  const raw = segments
    .filter((segment) => segment.endSec > startSec && segment.startSec < endSec)
    .map((segment) => ({
      startSec: Math.max(startSec, segment.startSec),
      endSec: Math.min(endSec, segment.endSec),
    }))
    .filter((item) => item.endSec - item.startSec >= 0.35);

  const merged: ClipInterval[] = [];
  for (const item of raw) {
    const previous = merged.at(-1);
    if (previous && item.startSec - previous.endSec <= 0.8) {
      previous.endSec = Math.max(previous.endSec, item.endSec);
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
};

export const remapSegmentsToIntervals = (
  segments: TranscriptSegment[],
  intervals: ClipInterval[]
): TranscriptSegment[] => {
  const remapped: TranscriptSegment[] = [];
  let offset = 0;

  for (const interval of intervals) {
    for (const segment of segments) {
      if (segment.endSec <= interval.startSec || segment.startSec >= interval.endSec) continue;
      remapped.push({
        ...segment,
        id: `seg-${String(remapped.length + 1).padStart(5, '0')}`,
        startSec: offset + Math.max(segment.startSec, interval.startSec) - interval.startSec,
        endSec: offset + Math.min(segment.endSec, interval.endSec) - interval.startSec,
      });
    }
    offset += interval.endSec - interval.startSec;
  }

  return remapped;
};

export const compactClip = async (opts: {
  sourcePath: string;
  intervals: ClipInterval[];
  segments: TranscriptSegment[];
  outputPath: string;
}): Promise<CompactClipResult> => {
  await mkdir(path.dirname(opts.outputPath), { recursive: true });

  if (opts.intervals.length === 0) {
    throw new Error('No speech intervals to compact');
  }

  if (opts.intervals.length === 1) {
    const only = opts.intervals[0];
    await run('ffmpeg', [
      '-y',
      '-ss',
      String(only.startSec),
      '-i',
      opts.sourcePath,
      '-t',
      String(only.endSec - only.startSec),
      '-c',
      'copy',
      opts.outputPath,
    ], true);
  } else {
    const filters: string[] = [];
    const concatInputs: string[] = [];
    opts.intervals.forEach((interval, index) => {
      filters.push(`[0:v]trim=start=${interval.startSec}:end=${interval.endSec},setpts=PTS-STARTPTS[v${index}]`);
      filters.push(`[0:a]atrim=start=${interval.startSec}:end=${interval.endSec},asetpts=PTS-STARTPTS[a${index}]`);
      concatInputs.push(`[v${index}][a${index}]`);
    });
    filters.push(`${concatInputs.join('')}concat=n=${opts.intervals.length}:v=1:a=1[v][a]`);

    await run('ffmpeg', [
      '-y',
      '-i',
      opts.sourcePath,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      opts.outputPath,
    ], true);
  }

  const durationSec = opts.intervals.reduce((sum, item) => sum + item.endSec - item.startSec, 0);
  return {
    outputPath: opts.outputPath,
    durationSec,
    segments: remapSegmentsToIntervals(opts.segments, opts.intervals),
  };
};
