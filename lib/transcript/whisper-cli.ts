import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { transcriptSchema, type Transcript, type TranscriptSegment } from './schema.js';

export interface WhisperCliOptions {
  inputPath: string;
  outputDir: string;
  bin?: string;
  model?: string;
  language?: string;
}

interface WhisperJsonSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperJsonOutput {
  text?: string;
  segments?: WhisperJsonSegment[];
  language?: string;
}

const run = async (cmd: string, args: string[]): Promise<void> => {
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

const buildSegments = (segments: WhisperJsonSegment[] | undefined): TranscriptSegment[] => {
  return (segments ?? [])
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, index) => ({
      id: `seg-${String(index + 1).padStart(5, '0')}`,
      startSec: Number(segment.start.toFixed(3)),
      endSec: Number(segment.end.toFixed(3)),
      text: segment.text.trim(),
    }));
};

export const transcribeWithWhisperCli = async (
  options: WhisperCliOptions
): Promise<Transcript> => {
  const bin = options.bin || process.env.WHISPER_CLI_BIN || 'whisper';
  const model = options.model || process.env.WHISPER_MODEL || 'medium';
  const language = options.language || process.env.WHISPER_LANGUAGE || 'ko';
  const outputDir = path.resolve(options.outputDir);
  const inputPath = path.resolve(options.inputPath);

  await mkdir(outputDir, { recursive: true });

  const args = [
    inputPath,
    '--model',
    model,
    '--language',
    language,
    '--output_format',
    'json',
    '--output_dir',
    outputDir,
  ];

  await run(bin, args);

  const basename = path.basename(inputPath, path.extname(inputPath));
  const whisperJsonPath = path.join(outputDir, `${basename}.json`);
  const raw = await readFile(whisperJsonPath, 'utf8');
  const parsed = JSON.parse(raw) as WhisperJsonOutput;
  const segments = buildSegments(parsed.segments);

  return transcriptSchema.parse({
    sourcePath: inputPath,
    language: parsed.language || language,
    createdAt: new Date().toISOString(),
    engine: 'whisper-cli',
    model,
    segments,
    text: parsed.text?.trim() || segments.map((segment) => segment.text).join('\n'),
  });
};
