import path from 'node:path';
import { parseSubtitleFile } from './subtitle-parser.js';
import { transcribeWithWhisperCli } from './whisper-cli.js';
import { getYouTubeCaptionTranscript } from './youtube-captions.js';
import type { Transcript } from './schema.js';

export interface TranscribeOptions {
  source: string;
  outputDir: string;
  subtitlePath?: string;
  language?: string;
}

const isYouTubeUrl = (source: string): boolean => {
  try {
    const url = new URL(source);
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname);
  } catch {
    return false;
  }
};

export const transcribeSource = async (options: TranscribeOptions): Promise<Transcript> => {
  const language = options.language || process.env.TRANSCRIPT_LANGUAGE || 'ko';
  const outputDir = path.resolve(options.outputDir);

  if (isYouTubeUrl(options.source)) {
    const youtubeTranscript = await getYouTubeCaptionTranscript({
      url: options.source,
      outputDir: path.join(outputDir, 'youtube-captions'),
      language,
    });
    if (youtubeTranscript) return youtubeTranscript;
  }

  if (options.subtitlePath) {
    return parseSubtitleFile({
      subtitlePath: options.subtitlePath,
      sourcePath: options.source,
      language,
      engine: 'manual-subtitle',
    });
  }

  if (isYouTubeUrl(options.source)) {
    throw new Error(
      'No YouTube captions found. Download the video/audio first or provide --subtitle before using Whisper fallback.'
    );
  }

  return transcribeWithWhisperCli({
    inputPath: options.source,
    outputDir: path.join(outputDir, 'whisper'),
    language,
  });
};
