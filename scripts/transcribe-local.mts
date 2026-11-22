import { config as loadEnv } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transcribeSource } from '../lib/transcript/transcribe.js';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith('--'));
const outputDirArg = args.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
const subtitlePath = args.find((arg) => arg.startsWith('--subtitle='))?.slice('--subtitle='.length);
const language = args.find((arg) => arg.startsWith('--lang='))?.slice('--lang='.length);

if (!inputPath) {
  console.error('Usage: npm run transcribe -- <youtube-url-or-local-file> [--subtitle=path/to.srt] [--out=dir] [--lang=ko]');
  process.exit(1);
}

const outputDir = outputDirArg || path.join('outputs', 'transcripts', path.basename(inputPath));
await mkdir(outputDir, { recursive: true });

const transcript = await transcribeSource({
  source: inputPath,
  outputDir,
  subtitlePath,
  language,
});

const transcriptPath = path.join(outputDir, 'transcript.json');
await writeFile(transcriptPath, JSON.stringify(transcript, null, 2), 'utf8');

console.log(`Transcript saved: ${transcriptPath}`);
console.log(`Engine: ${transcript.engine} (${transcript.model})`);
console.log(`Segments: ${transcript.segments.length}`);
