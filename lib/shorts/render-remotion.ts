import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptSegment } from '../transcript/schema.js';

export interface RenderRemotionShortOptions {
  sourcePath: string;
  startSec: number;
  endSec: number;
  outputPath: string;
  title?: string;
  segments: TranscriptSegment[];
  layoutMode?: 'fit-blur' | 'center-crop';
}

const getBundle = async (): Promise<string> => {
  return await bundle({
    entryPoint: path.resolve('remotion', 'index.ts'),
    publicDir: path.resolve('public'),
  });
};

export const renderRemotionShort = async (
  options: RenderRemotionShortOptions
): Promise<string> => {
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const assetDir = path.resolve('public', 'remotion-assets');
  await mkdir(assetDir, { recursive: true });
  const sourceExt = path.extname(options.sourcePath) || '.mp4';
  const assetName = `source-${Date.now()}-${Math.random().toString(36).slice(2)}${sourceExt}`;
  const assetPath = path.join(assetDir, assetName);
  await copyFile(path.resolve(options.sourcePath), assetPath);

  const serveUrl = await getBundle();
  const inputProps = {
    sourcePath: `remotion-assets/${assetName}`,
    startSec: options.startSec,
    endSec: options.endSec,
    title: options.title,
    segments: options.segments,
    layoutMode: options.layoutMode || 'fit-blur',
  };

  const composition = await selectComposition({
    serveUrl,
    id: 'ShortClip',
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: options.outputPath,
    inputProps,
    overwrite: true,
    chromiumOptions: {
      enableMultiProcessOnLinux: true,
    },
  });

  return options.outputPath;
};
