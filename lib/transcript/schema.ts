import { z } from 'zod';

export const transcriptSegmentSchema = z.object({
  id: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const transcriptSchema = z.object({
  sourcePath: z.string(),
  language: z.string().default('ko'),
  durationSec: z.number().nonnegative().optional(),
  createdAt: z.string(),
  engine: z.enum(['youtube-captions', 'manual-subtitle', 'whisper-cli']),
  model: z.string(),
  segments: z.array(transcriptSegmentSchema),
  text: z.string(),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
