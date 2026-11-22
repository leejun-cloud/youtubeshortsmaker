import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { run, runCapture } from '../utils/run.js';

export interface PreparedSource {
  input: string;
  sourcePath: string;
  title: string;
  id: string;
  isYouTube: boolean;
}

export interface YouTubeInfo {
  id: string;
  title: string;
}

export const isYouTubeUrl = (source: string): boolean => {
  try {
    const url = new URL(source);
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname);
  } catch {
    return false;
  }
};

const safeName = (value: string): string => {
  return value
    .normalize('NFKD')
    .replace(/[^\w가-힣.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'video';
};

export const getProjectId = async (input: string): Promise<string> => {
  if (!isYouTubeUrl(input)) {
    return `${Date.now()}-${safeName(path.basename(input, path.extname(input)))}`;
  }
  const bin = process.env.YTDLP_BIN || 'yt-dlp';
  const id = (await runCapture(bin, ['--print', 'id', '--skip-download', input])).trim().split('\n').at(-1);
  return id || `${Date.now()}-youtube`;
};

export const getYouTubeInfo = async (input: string): Promise<YouTubeInfo> => {
  const bin = process.env.YTDLP_BIN || 'yt-dlp';
  const id = (await runCapture(bin, ['--print', 'id', '--skip-download', input])).trim().split('\n').at(-1) || 'youtube';
  const title = (await runCapture(bin, ['--print', 'title', '--skip-download', input])).trim().split('\n').at(-1) || id;
  return { id, title };
};

export const downloadYouTubeSection = async (opts: {
  url: string;
  outputPath: string;
  startSec: number;
  endSec: number;
}): Promise<string> => {
  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  const bin = process.env.YTDLP_BIN || 'yt-dlp';
  await run(bin, [
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
    '--merge-output-format',
    'mp4',
    '--download-sections',
    `*${opts.startSec}-${opts.endSec}`,
    '--force-keyframes-at-cuts',
    '-o',
    opts.outputPath,
    opts.url,
  ]);
  return opts.outputPath;
};

export const prepareSource = async (input: string, projectDir: string): Promise<PreparedSource> => {
  await mkdir(projectDir, { recursive: true });

  if (!isYouTubeUrl(input)) {
    return {
      input,
      sourcePath: path.resolve(input),
      title: path.basename(input, path.extname(input)),
      id: path.basename(input, path.extname(input)),
      isYouTube: false,
    };
  }

  const bin = process.env.YTDLP_BIN || 'yt-dlp';
  const { id, title } = await getYouTubeInfo(input);
  const outputTemplate = path.join(projectDir, 'source.%(ext)s');

  await run(bin, [
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outputTemplate,
    input,
  ]);

  return {
    input,
    sourcePath: path.join(projectDir, 'source.mp4'),
    title,
    id,
    isYouTube: true,
  };
};
