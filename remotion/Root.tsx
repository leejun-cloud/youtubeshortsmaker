import React from 'react';
import {
  AbsoluteFill,
  Composition,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';

const segmentSchema = z.object({
  id: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
});

export const shortClipSchema = z.object({
  sourcePath: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  title: z.string().optional(),
  segments: z.array(segmentSchema),
  layoutMode: z.enum(['fit-blur', 'center-crop']).default('fit-blur'),
});

type ShortClipProps = z.infer<typeof shortClipSchema>;

const activeText = (segments: ShortClipProps['segments'], clipStart: number, timeSec: number) => {
  const absolute = clipStart + timeSec;
  const segment = segments.find((item) => absolute >= item.startSec && absolute <= item.endSec);
  return segment?.text || '';
};

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame % 12, [0, 4], [0.75, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (!text) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        bottom: 185,
        opacity,
        background: 'rgba(0,0,0,0.68)',
        borderRadius: 18,
        padding: '28px 34px',
        color: 'white',
        fontFamily: 'Arial, Apple SD Gothic Neo, sans-serif',
        fontSize: 58,
        fontWeight: 800,
        lineHeight: 1.22,
        textAlign: 'center',
        textShadow: '0 4px 14px rgba(0,0,0,0.55)',
        wordBreak: 'keep-all',
      }}
    >
      {text}
    </div>
  );
};

const TitleBadge: React.FC<{ title?: string }> = ({ title }) => {
  if (!title) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 54,
        right: 54,
        top: 78,
        color: '#111',
        background: '#ffe45c',
        borderRadius: 14,
        padding: '18px 24px',
        fontFamily: 'Arial, Apple SD Gothic Neo, sans-serif',
        fontSize: 36,
        fontWeight: 900,
        textAlign: 'center',
      }}
    >
      {title.replace(/#Shorts/i, '').slice(0, 34)}
    </div>
  );
};

export const ShortClip: React.FC<ShortClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const text = activeText(props.segments, props.startSec, timeSec);
  const from = Math.floor(props.startSec * fps);
  const duration = Math.ceil((props.endSec - props.startSec) * fps);
  const src = /^https?:\/\//.test(props.sourcePath) ? props.sourcePath : staticFile(props.sourcePath);

  return (
    <AbsoluteFill style={{ background: '#050505' }}>
      {props.layoutMode === 'fit-blur' ? (
        <>
          <Sequence from={0} durationInFrames={duration}>
            <OffthreadVideo
              src={src}
              startFrom={from}
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(34px) brightness(0.72) saturate(1.1)',
                transform: 'scale(1.12)',
              }}
            />
          </Sequence>
          <Sequence from={0} durationInFrames={duration}>
            <OffthreadVideo
              src={src}
              startFrom={from}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </Sequence>
        </>
      ) : (
        <Sequence from={0} durationInFrames={duration}>
          <OffthreadVideo
            src={src}
            startFrom={from}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </Sequence>
      )}
      <TitleBadge title={props.title} />
      <Caption text={text} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortClip"
      component={ShortClip}
      schema={shortClipSchema}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={1800}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.ceil((props.endSec - props.startSec) * 30),
      })}
      defaultProps={{
        sourcePath: '',
        startSec: 0,
        endSec: 30,
        title: '하이라이트',
        segments: [],
        layoutMode: 'fit-blur' as const,
      }}
    />
  );
};
