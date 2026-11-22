import { config as loadEnv } from 'dotenv';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateHighlights } from '../lib/highlights/generate.js';
import { rerankHighlightsByContent } from '../lib/highlights/rerank.js';
import { renderShort } from '../lib/shorts/render-ffmpeg.js';
import { renderRemotionShort } from '../lib/shorts/render-remotion.js';
import { writeClipSrt } from '../lib/subtitles/srt.js';
import { renderThumbnails } from '../lib/thumbnails/render.js';
import { cleanTranscript } from '../lib/transcript/clean.js';
import { transcribeSource } from '../lib/transcript/transcribe.js';
import { buildSpeechIntervals, compactClip } from '../lib/video/compact.js';
import {
  downloadYouTubeSection,
  getProjectId,
  getYouTubeInfo,
  isYouTubeUrl,
  prepareSource,
} from '../lib/video/source.js';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const source = args.find((arg) => !arg.startsWith('--'));
const count = Number(args.find((arg) => arg.startsWith('--count='))?.slice('--count='.length) || 3);
const duration = Number(args.find((arg) => arg.startsWith('--duration='))?.slice('--duration='.length) || 45);
const subtitlePath = args.find((arg) => arg.startsWith('--subtitle='))?.slice('--subtitle='.length);
const language = args.find((arg) => arg.startsWith('--lang='))?.slice('--lang='.length);
const layoutMode = (args.find((arg) => arg.startsWith('--layout='))?.slice('--layout='.length) || 'fit-blur') as 'fit-blur' | 'center-crop';
const renderer = (args.find((arg) => arg.startsWith('--renderer='))?.slice('--renderer='.length) || 'remotion') as 'remotion' | 'ffmpeg';
const minGapSec = Number(args.find((arg) => arg.startsWith('--min-gap='))?.slice('--min-gap='.length) || 180);

if (!source) {
  console.error('Usage: npm run make:shorts -- <youtube-url-or-local-file> [--count=3] [--duration=45] [--subtitle=caption.srt] [--layout=fit-blur|center-crop] [--renderer=remotion|ffmpeg]');
  process.exit(1);
}

const projectId = await getProjectId(source);
const projectDir = path.resolve('outputs', projectId);
await mkdir(projectDir, { recursive: true });

console.log(`[1/6] Preparing source: ${source}`);
const youtubeInput = isYouTubeUrl(source);
const sourceInfo = youtubeInput
  ? { ...(await getYouTubeInfo(source)), sourcePath: '', input: source, isYouTube: true }
  : await prepareSource(source, projectDir);

console.log('[2/6] Building transcript');
const rawTranscript = await transcribeSource({
  source,
  outputDir: path.join(projectDir, 'transcript'),
  subtitlePath,
  language,
});
const transcript = cleanTranscript(rawTranscript);
await writeFile(path.join(projectDir, 'transcript.raw.json'), JSON.stringify(rawTranscript, null, 2), 'utf8');
await writeFile(path.join(projectDir, 'transcript.json'), JSON.stringify(transcript, null, 2), 'utf8');

console.log('[3/6] Selecting content-important highlights');
const localHighlights = generateHighlights(transcript, {
  count: Math.max(count * 6, 18),
  targetDurationSec: duration,
  mode: 'content',
  minGapSec,
});
const highlights = await rerankHighlightsByContent(localHighlights, {
  count,
  videoTitle: sourceInfo.title,
});
await writeFile(path.join(projectDir, 'highlights.json'), JSON.stringify(highlights, null, 2), 'utf8');

console.log(`[4/6] Rendering ${highlights.length} short(s)`);
for (const [index, highlight] of highlights.entries()) {
  const shortDir = path.join(projectDir, `short-${String(index + 1).padStart(3, '0')}`);
  await mkdir(shortDir, { recursive: true });
  const clipStartSec = Math.max(0, highlight.startSec - 1.2);
  const clipEndSec = highlight.endSec + 1.2;
  const sourceFileName = `source-${Math.round(clipStartSec * 10)}-${Math.round(clipEndSec * 10)}.mp4`;
  const sourcePath = youtubeInput
    ? await downloadYouTubeSection({
        url: source,
        outputPath: path.join(shortDir, sourceFileName),
        startSec: clipStartSec,
        endSec: clipEndSec,
      })
    : sourceInfo.sourcePath;
  const renderStartSec = youtubeInput ? highlight.startSec - clipStartSec : highlight.startSec;
  const renderEndSec = youtubeInput ? highlight.endSec - clipStartSec : highlight.endSec;
  const renderSegments = youtubeInput
    ? transcript.segments.map((segment) => ({
        ...segment,
        startSec: segment.startSec - clipStartSec,
        endSec: segment.endSec - clipStartSec,
      }))
    : transcript.segments;
  const speechIntervals = buildSpeechIntervals(renderSegments, renderStartSec, renderEndSec);
  const compacted = await compactClip({
    sourcePath,
    intervals: speechIntervals,
    segments: renderSegments,
    outputPath: path.join(shortDir, 'source.compact.mp4'),
  });
  const finalSourcePath = compacted.outputPath;
  const finalStartSec = 0;
  const finalEndSec = compacted.durationSec;
  const finalSegments = compacted.segments;

  const srtPath = await writeClipSrt({
    segments: finalSegments,
    startSec: finalStartSec,
    endSec: finalEndSec,
    outputPath: path.join(shortDir, 'subtitles.srt'),
  });

  const outputPath = path.join(shortDir, 'short.mp4');
  const videoPath =
    renderer === 'remotion'
      ? await renderRemotionShort({
          sourcePath: finalSourcePath,
          startSec: finalStartSec,
          endSec: finalEndSec,
          outputPath,
          title: highlight.title,
          segments: finalSegments,
          layoutMode,
        })
      : await renderShort({
          sourcePath: finalSourcePath,
          startSec: finalStartSec,
          endSec: finalEndSec,
          srtPath,
          outputPath,
          layoutMode,
          captionText: highlight.hook,
        });

  console.log(`[5/6] Rendering thumbnails for ${highlight.id}`);
  const thumbnails = await renderThumbnails({
    sourcePath: finalSourcePath,
    candidate: youtubeInput
      ? { ...highlight, startSec: finalStartSec, endSec: finalEndSec }
      : highlight,
    outputDir: path.join(shortDir, 'thumbnail-variants'),
  });
  const bestThumb = thumbnails.sort((a, b) => b.score - a.score)[0];
  if (bestThumb) {
    await cp(bestThumb.imagePath, path.join(shortDir, 'thumbnail.png'));
  }

  const metadata = [
    `# ${highlight.title}`,
    '',
    `Video: ${videoPath}`,
    `Thumbnail: ${path.join(shortDir, 'thumbnail.png')}`,
    `Source: ${sourceInfo.title}`,
    `Start: ${highlight.startSec.toFixed(2)}s`,
    `End: ${highlight.endSec.toFixed(2)}s`,
    '',
    '## Description',
    highlight.description,
    '',
    '## Hashtags',
    highlight.hashtags.join(' '),
    '',
    '## Selection Reason',
    highlight.reason,
  ].join('\n');
  await writeFile(path.join(shortDir, 'metadata.md'), metadata, 'utf8');
  await writeFile(path.join(shortDir, 'short.json'), JSON.stringify({ highlight, thumbnails }, null, 2), 'utf8');
}

console.log('[6/6] Done');
console.log(`Output: ${projectDir}`);
