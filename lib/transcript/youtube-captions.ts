import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseSubtitleFile } from './subtitle-parser.js';
import type { Transcript } from './schema.js';

export interface YouTubeCaptionOptions {
  url: string;
  outputDir: string;
  language?: string;
  bin?: string;
}

const runCapture = async (cmd: string, args: string[]): Promise<string> => {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${cmd} exited with code ${code}: ${stderr || stdout}`));
    });
  });
};

const runInherited = async (cmd: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
};

const getVideoId = async (bin: string, url: string): Promise<string> => {
  const id = (await runCapture(bin, ['--print', 'id', '--skip-download', url])).trim();
  if (!id) throw new Error('yt-dlp did not return a video id');
  return id.split('\n').at(-1)?.trim() || id;
};

const findSubtitle = async (
  outputDir: string,
  videoId: string,
  language: string,
  auto: boolean
): Promise<string | null> => {
  const files = await readdir(outputDir);
  const suffixes = ['vtt', 'srt'];
  const preferredNames = suffixes.flatMap((ext) => [
    `${videoId}.${language}.${ext}`,
    `${videoId}.${language.split('-')[0]}.${ext}`,
  ]);

  for (const name of preferredNames) {
    if (files.includes(name)) return path.join(outputDir, name);
  }

  const candidates = files
    .filter((file) => suffixes.some((ext) => file.endsWith(`.${ext}`)))
    .filter((file) => file.startsWith(`${videoId}.`))
    .filter((file) => file.includes(`.${language}.`) || file.includes(`.${language.split('-')[0]}.`));

  if (candidates.length > 0) return path.join(outputDir, candidates[0]);

  if (!auto) return null;

  const anyCaption = files
    .filter((file) => suffixes.some((ext) => file.endsWith(`.${ext}`)))
    .find((file) => file.startsWith(`${videoId}.`));
  return anyCaption ? path.join(outputDir, anyCaption) : null;
};

const downloadCaptions = async (opts: {
  bin: string;
  url: string;
  outputDir: string;
  videoId: string;
  language: string;
  auto: boolean;
}): Promise<string | null> => {
  const args = [
    '--skip-download',
    opts.auto ? '--write-auto-subs' : '--write-subs',
    '--sub-langs',
    `${opts.language},${opts.language.split('-')[0]}`,
    '--sub-format',
    'vtt/srt',
    '-o',
    path.join(opts.outputDir, '%(id)s.%(ext)s'),
    opts.url,
  ];

  try {
    await runInherited(opts.bin, args);
  } catch {
    return null;
  }

  return findSubtitle(opts.outputDir, opts.videoId, opts.language, opts.auto);
};

export const getYouTubeCaptionTranscript = async (
  options: YouTubeCaptionOptions
): Promise<Transcript | null> => {
  const bin = options.bin || process.env.YTDLP_BIN || 'yt-dlp';
  const language = options.language || process.env.TRANSCRIPT_LANGUAGE || 'ko';
  const outputDir = path.resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const videoId = await getVideoId(bin, options.url);

  const manualSubtitle = await downloadCaptions({
    bin,
    url: options.url,
    outputDir,
    videoId,
    language,
    auto: false,
  });
  if (manualSubtitle) {
    return parseSubtitleFile({
      subtitlePath: manualSubtitle,
      sourcePath: options.url,
      language,
      engine: 'youtube-captions',
      model: 'youtube-manual-caption',
    });
  }

  const autoSubtitle = await downloadCaptions({
    bin,
    url: options.url,
    outputDir,
    videoId,
    language,
    auto: true,
  });
  if (!autoSubtitle) return null;

  return parseSubtitleFile({
    subtitlePath: autoSubtitle,
    sourcePath: options.url,
    language,
    engine: 'youtube-captions',
    model: 'youtube-auto-caption',
  });
};
