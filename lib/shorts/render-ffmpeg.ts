import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../utils/run.js';

export interface RenderShortOptions {
  sourcePath: string;
  startSec: number;
  endSec: number;
  srtPath: string;
  outputPath: string;
  layoutMode?: 'fit-blur' | 'center-crop';
  captionText?: string;
}

export const renderShort = async (options: RenderShortOptions): Promise<string> => {
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const duration = Math.max(1, options.endSec - options.startSec);
  const layout =
    options.layoutMode === 'center-crop'
      ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
      : 'split=2[base][fg];[base]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28[bg];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg2];[bg][fg2]overlay=(W-w)/2:(H-h)/2';
  const vf = layout;

  await run('ffmpeg', [
    '-y',
    '-ss',
    String(options.startSec),
    '-i',
    options.sourcePath,
    '-t',
    String(duration),
    '-vf',
    vf,
    '-r',
    '30',
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
    '-movflags',
    '+faststart',
    options.outputPath,
  ]);

  return options.outputPath;
};
