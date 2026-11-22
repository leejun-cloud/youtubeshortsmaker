# PRD: Longform to YouTube Shorts Maker

## 1. 제품 개요

Longform to YouTube Shorts Maker는 긴 유튜브 영상 또는 로컬 영상 파일을 입력하면 핵심 하이라이트를 자동으로 찾아 여러 개의 9:16 쇼츠 영상으로 만드는 데스크톱/로컬 웹 앱이다. 참조 프로젝트 `iscardnew`의 Next.js + Remotion 기반 영상 렌더링 구조, `andykais/ffmpeg-templates`의 템플릿 기반 ffmpeg 편집 방식, `fbsamples/video-template-builder`의 Source/Combinator/Sink 구조, `videoNotes`의 유튜브 자막/요약 흐름을 참고하되, 본 제품은 카드뉴스 생성이 아니라 기존 롱폼 영상에서 의미 있는 구간을 추출하고 쇼츠 포맷으로 재가공하는 것에 집중한다.

## 2. 목표

- 유튜브 URL 또는 로컬 MP4 입력만으로 쇼츠 후보 N개를 자동 생성한다.
- 영상의 음성 전사, 장면 분할, 하이라이트 점수화를 통해 중요한 구간을 추천한다.
- 추천된 구간을 사용자가 확인하고 시작/종료 시간을 조정할 수 있다.
- 1080x1920 세로형 쇼츠 MP4, 자막 SRT/VTT, 제목/설명/해시태그 초안을 함께 생성한다.
- 사람들의 클릭을 유도할 수 있는 후킹 썸네일 후보를 쇼츠별로 자동 생성한다.
- 초기 버전은 로컬 실행을 우선하고, 외부 배포/클라우드 워크플로는 후순위로 둔다.

## 3. 비목표

- 저작권을 우회하거나 DRM이 걸린 영상을 다운로드하는 기능은 제공하지 않는다.
- 사용자의 계정 없이 비공개/회원 전용 유튜브 영상을 가져오는 기능은 제공하지 않는다.
- 완전 자동 업로드는 MVP 범위에서 제외한다. 단, 추후 YouTube 업로드 연동이 가능하도록 메타데이터 구조는 준비한다.
- 복잡한 멀티트랙 편집기 수준의 타임라인 편집은 제공하지 않는다.

## 4. 주요 사용자

- 유튜브 크리에이터: 긴 강의, 인터뷰, 팟캐스트, 리뷰 영상을 쇼츠로 재활용하려는 사용자.
- 마케터/운영자: 웨비나, 제품 설명회, 행사 영상을 짧은 홍보 클립으로 변환하려는 사용자.
- 교육 콘텐츠 제작자: 긴 수업 영상에서 핵심 개념 구간을 뽑아 짧은 학습 클립으로 만들려는 사용자.

## 5. 핵심 사용 흐름

1. 사용자가 유튜브 URL 또는 로컬 영상 파일을 입력한다.
2. 앱이 영상 정보를 읽고 오디오를 추출한다.
3. 음성을 전사하고 문장 단위 타임스탬프를 만든다.
4. 전사 텍스트, 무음/음량 변화, 키워드, 감정 표현, 장면 전환 정보를 바탕으로 하이라이트 후보를 만든다.
5. 후보를 점수순으로 보여주고, 사용자는 만들 쇼츠 개수와 길이를 선택한다.
6. 사용자가 각 후보의 시작/종료 시간, 제목, 자막 스타일을 조정한다.
7. 앱이 세로형 쇼츠 MP4를 렌더링하고 결과 폴더에 저장한다.

## 6. 기능 요구사항

### 6.1 입력

- 유튜브 공개 URL 입력을 지원한다.
- 로컬 MP4/MOV 파일 입력을 지원한다.
- 영상 길이는 MVP 기준 최대 2시간까지 지원한다.
- 입력 영상의 제목, 길이, 썸네일, 해상도, 오디오 유무를 표시한다.
- 다운로드/분석 실패 시 원인과 재시도 방법을 화면에 표시한다.

### 6.2 전사

- 영상 오디오를 추출해 전사한다.
- 한국어를 1차 지원 언어로 한다.
- 문장 또는 짧은 발화 단위의 시작/종료 타임스탬프를 보존한다.
- 전사 결과는 JSON과 SRT로 저장한다.
- 유튜브 URL 입력은 YouTube 수동 자막을 최우선으로 사용한다.
- 수동 자막이 없으면 YouTube 자동 자막(auto captions)을 사용한다.
- YouTube 자막이 없거나 로컬 파일 입력인 경우, 사용자가 제공한 SRT/VTT를 사용한다.
- 마지막 fallback으로 로컬 Whisper CLI를 실행한다.

### 6.3 하이라이트 탐지

- 기본 후보 길이: 20초, 30초, 45초, 60초 중 선택 가능해야 한다.
- 후보 개수: 기본 5개, 사용자가 1-10개 범위에서 설정 가능해야 한다.
- 점수 산정 요소:
  - 훅 문장: 질문, 반전, 강한 주장, 숫자, 문제 제기.
  - 정보 밀도: 짧은 시간 안에 핵심 설명이 많은 구간.
  - 감정/강조: 웃음, 놀람, 단호한 표현, 청중 반응.
  - 맥락 완결성: 시작과 끝이 자연스럽고 하나의 메시지로 끝나는 구간.
  - 중복 방지: 같은 내용을 반복하는 후보는 낮은 점수.
- 각 후보에는 점수, 추천 이유, 핵심 문장, 시작/종료 시간이 포함되어야 한다.

### 6.4 편집 UI

- 후보 리스트와 미리보기 플레이어를 제공한다.
- 시작/종료 시간을 초 단위로 조정할 수 있다.
- 후보별 제목, 설명, 해시태그 초안을 수정할 수 있다.
- 자막 표시 여부, 글꼴 크기, 위치, 강조 색상을 선택할 수 있다.
- 쇼츠 안전 영역을 고려한 9:16 미리보기를 제공한다.

### 6.5 렌더링

- 출력 비율: 9:16.
- 기본 해상도: 1080x1920.
- 기본 FPS: 원본 또는 30fps.
- 원본 화면을 세로형으로 변환할 때 다음 모드를 지원한다.
  - Center crop: 중앙 크롭.
  - Fit blur: 원본 전체를 유지하고 배경을 블러 처리.
  - Speaker focus: 얼굴/주요 피사체 중심 크롭. MVP에서는 선택 기능만 두고 구현은 후순위 가능.
- 자동 자막을 영상 위에 합성한다.
- 쇼츠별 파일명은 `short-001-title.mp4` 형식으로 저장한다.
- 렌더링 엔진은 작업 성격에 따라 선택 가능해야 한다.
  - Remotion: 자막 스타일, 오버레이, 썸네일, 복잡한 레이아웃이 필요한 쇼츠.
  - ffmpeg template: 컷, 크롭, 블러 배경, 단순 자막 합성처럼 빠른 배치 처리가 중요한 쇼츠.

### 6.6 결과물

각 쇼츠 결과 폴더에는 다음 파일을 저장한다.

- `short-XXX.mp4`: 최종 쇼츠 영상.
- `short-XXX.srt`: 자막 파일.
- `short-XXX.json`: 클립 메타데이터.
- `thumbnail.png`: 썸네일 후보 이미지.
- `thumbnail-variants/`: 후킹 썸네일 후보 3-5개.
- `metadata.md`: 제목, 설명, 해시태그, 추천 업로드 문구.

### 6.8 후킹 썸네일 생성

`iscardnew`의 포토 카드뉴스/이미지 생성 흐름과 YouTube 커스텀 썸네일 업로드 구조를 참고해, 쇼츠별 썸네일 후보를 자동 생성한다.

- 썸네일은 기본 3개 후보를 만든다.
  - `shock`: 충격/반전형.
  - `question`: 질문/궁금증형.
  - `benefit`: 이득/결과 약속형.
- 각 후보는 다음 정보를 포함한다.
  - 배경 프레임: 하이라이트 구간에서 표정/동작/화면 변화가 강한 프레임.
  - 후킹 문구: 8-16자 한국어 짧은 카피.
  - 보조 문구: 선택 사항, 20자 이내.
  - 강조 색상/레이아웃.
  - CTR 점수와 추천 이유.
- 텍스트 규칙:
  - 모바일에서 즉시 읽히는 1-2줄.
  - 과장 광고, 허위 사실, 혐오/자극적 표현은 금지.
  - 영상 내용과 직접 연결된 약속만 사용.
- 이미지 소스 우선순위:
  1. 원본 영상 프레임 캡처.
  2. 원본 프레임 + 블러/확대 배경.
  3. Pexels/Pixabay 배경.
  4. Vertex Imagen 기반 AI 배경.
- 출력:
  - `thumbnail.png`: 최종 추천 썸네일.
  - `thumbnail-001.png` ... `thumbnail-005.png`: 후보 이미지.
  - `thumbnail.json`: 카피, 점수, 선택 이유, 사용 프레임 시각.
- YouTube 업로드 연동 시 `thumbnailPath`로 최종 썸네일을 전달한다.

### 6.7 프로젝트/작업 관리

- 하나의 원본 영상 분석 결과를 프로젝트 단위로 저장한다.
- 재실행 시 기존 전사/분석 결과를 캐시해 비용과 시간을 줄인다.
- 결과는 `outputs/<project-id>/` 아래에 저장한다.

## 7. 비기능 요구사항

- Node.js 20 이상에서 동작해야 한다.
- macOS 로컬 개발 환경을 1차 지원한다.
- ffmpeg 설치가 필요하며, 없을 경우 명확한 안내를 제공한다.
- 1시간 영상 기준 분석과 후보 생성은 10분 이내를 목표로 한다. 외부 API와 하드웨어 성능에 따라 달라질 수 있다.
- 렌더링 중 진행률을 표시한다.
- API 키, OAuth 토큰 등 민감 정보는 `.env.local`에 저장하고 Git에 포함하지 않는다.

## 8. 기술 설계 방향

### 8.1 스택

- App/UI: Next.js, React, TypeScript.
- 영상 렌더링: ffmpeg template renderer + Remotion.
- 영상/오디오 처리: ffmpeg.
- 템플릿 기반 편집: `andykais/ffmpeg-templates`의 YAML/JSON template 개념을 참고한 내부 template schema.
- 분석/시각화 보조: Python worker를 선택적으로 두고, matplotlib/ffmpeg 방식은 품질 분석 리포트나 파형/점수 그래프 생성에만 제한적으로 사용한다.
- 유튜브 다운로드: `yt-dlp` 또는 동등한 CLI를 사용하되 공개 영상과 사용자 권한 범위 내에서만 사용한다.
- 전사: YouTube captions, 수동 SRT/VTT, 로컬 Whisper CLI, 외부 API fallback 어댑터 구조.
- 전사 기본값: YouTube URL은 YouTube captions, 로컬 파일은 수동 자막 또는 로컬 Whisper CLI.
- AI 분석: LLM 기반 하이라이트 점수화와 메타데이터 생성.

### 8.2 참조 프로젝트에서 가져올 패턴

- `iscardnew`의 Remotion composition 구조.
- 스크립트 기반 파이프라인 실행 방식.
- `.env.local` 기반 환경변수 로딩.
- `out/` 또는 `outputs/` 폴더에 렌더링 결과를 저장하는 방식.
- YouTube 메타데이터 생성/게시 연동 코드는 후속 단계에서 참고.
- `iscardnew/lib/reels/photo-structure.ts`의 강한 후킹 카피 생성 규칙.
- `iscardnew/lib/reels/image-gen.ts`의 Imagen 3 기반 9:16 이미지 생성과 미설정 시 fallback하는 패턴.
- `iscardnew/lib/youtube.ts`의 `thumbnailPath` 기반 YouTube 커스텀 썸네일 설정 방식.
- `andykais/ffmpeg-templates`의 YAML/JSON으로 클립, 레이아웃, crop, timeline을 선언하는 방식.
- preview/watch 중심의 빠른 반복 개념. MVP에서는 단일 프레임 preview 생성부터 지원한다.
- `fbsamples/video-template-builder`의 pull 기반 `Source -> Combinator -> Sink` 구조. 원본 영상, 배경 블러, 자막, 오버레이를 독립 Source로 보고 최종 쇼츠 Sink로 합성한다.
- `mibur1/python-videos`의 Python + matplotlib + ffmpeg 방식. 본편 렌더링에는 쓰지 않고, 하이라이트 점수 그래프/오디오 파형/분석 리포트 생성에 선택적으로 사용한다.
- `theashishmaurya/videoNotes`의 유튜브 기반 전사, 요약, 노트 생성 흐름. 쇼츠 후보 생성 전에 “영상 노트”를 만들어 전체 맥락을 먼저 파악하는 단계로 흡수한다.

### 8.3 렌더 백엔드 전략

MVP는 렌더링을 추상화해 두 개의 백엔드를 둘 수 있게 설계한다. 기본값은 빠르고 설치 의존성이 단순한 ffmpeg template renderer로 한다.

```ts
type RenderBackend = 'remotion' | 'ffmpeg-template';
```

- 기본 백엔드: `ffmpeg-template`.
- 고급 자막/브랜딩 템플릿 선택 시: `remotion`.
- 모든 하이라이트 후보는 공통 `ShortRenderSpec`으로 변환한 뒤 백엔드별 renderer가 처리한다.

```ts
type ShortRenderSpec = {
  sourcePath: string;
  startSec: number;
  endSec: number;
  outputPath: string;
  width: 1080;
  height: 1920;
  layoutMode: 'center-crop' | 'fit-blur' | 'speaker-focus';
  subtitles: TranscriptSegment[];
  title?: string;
  style: {
    subtitlePosition: 'bottom' | 'middle';
    subtitleColor: string;
    accentColor: string;
  };
};
```

ffmpeg template renderer는 이 spec을 다음과 같은 내부 template으로 변환한다.

```yaml
clips:
  - file: ./source.mp4
    id: main
    trim:
      start: 00:12:34
      end: 00:13:12
    layout:
      width: 1080px
      height: 1920px
    crop:
      mode: center-crop
timeline:
  00:00:00:
    - [main]
```

### 8.4 최종 권장 아키텍처

가장 현실적인 최상안은 “분석은 AI/전사 중심, 편집은 ffmpeg 중심, 고급 템플릿은 Remotion 선택” 구조다.

1. Ingest layer
   - 유튜브 URL, 로컬 MP4/MOV, 기존 transcript/SRT를 받는다.
   - 유튜브는 가능한 경우 공식 자막 또는 auto-cc를 먼저 사용하고, 없을 때만 오디오 추출 후 전사한다.
   - `yt-dlp`/`ytdl` 계열 도구는 공개 영상과 사용 권한이 있는 영상에만 사용한다.

2. Understanding layer
   - 전사본을 문장 단위 타임스탬프로 정규화한다.
   - `videoNotes` 방식처럼 전체 요약, 섹션 요약, 핵심 주장, 키워드, Q&A 후보를 먼저 생성한다.
   - 이 노트 구조를 하이라이트 탐지의 컨텍스트로 사용한다. 단순히 점수 높은 문장만 자르지 않고, “왜 이 구간이 쇼츠로 독립적인가”를 판단한다.

3. Highlight engine
   - 1차 후보는 규칙 기반으로 빠르게 만든다: 발화 밀도, 훅 문장, 숫자/질문/반전 표현, 침묵 구간, 섹션 경계.
   - 2차 후보는 LLM이 재점수화한다: 훅, 완결성, 바이럴 가능성, 중복도, 쇼츠 제목 적합성.
   - 후보는 `HighlightCandidate`로 저장하고, 사용자가 수정한 값은 원본 후보와 분리해 보존한다.

4. Template/render layer
   - `ffmpeg-template` 백엔드는 MVP 기본 렌더러다. 원본 클립 컷, 세로 크롭, 블러 배경, burn-in subtitle, BGM 믹싱에 사용한다.
   - `Remotion` 백엔드는 고급 자막 애니메이션, 브랜드 오버레이, 썸네일, 카드형 인트로/아웃트로에 사용한다.
   - `video-template-builder`의 Source/Combinator/Sink 개념을 내부 렌더 그래프 모델로 채택한다.

5. UI layer
   - Next.js 로컬 웹 앱으로 만든다.
   - 첫 화면은 URL/파일 입력, 분석 진행률, 후보 리스트, 9:16 미리보기, 렌더 버튼이 바로 보이는 작업 화면으로 구성한다.
   - 영상 편집 앱처럼 복잡한 타임라인을 만들지 않고, 쇼츠 후보 단위 편집에 집중한다.

6. Optional Python worker
   - Python은 필수 런타임에서 제외한다.
   - 필요한 경우에만 분석 리포트, 파형 이미지, 하이라이트 점수 그래프를 생성하는 worker로 둔다.
   - 본편 렌더링은 Node/ffmpeg/Remotion 쪽에서 처리해 배포 복잡도를 줄인다.

### 8.5 최종 선택 기준

- 빠른 MVP와 안정성: ffmpeg template renderer 우선.
- 자막/오버레이 표현력: Remotion 선택 지원.
- 대량 자동화: template spec을 JSON으로 저장해 같은 설정을 여러 후보에 반복 적용.
- 유지보수성: Source/Combinator/Sink 스타일의 내부 렌더 그래프.
- 콘텐츠 품질: `videoNotes`식 전체 요약/섹션 노트를 먼저 만들고 그 위에서 하이라이트를 고른다.
- 전사 안정성/비용: YouTube 자막을 먼저 사용하고, 없을 때만 로컬 Whisper CLI나 외부 API fallback을 사용한다.
- 클릭 성과: 쇼츠별 후킹 썸네일 후보를 여러 개 만들고 AI 점수와 사람이 직접 고르는 UX를 함께 둔다.

### 8.6 환경변수

`iscardnew`의 설정을 가져오되, 본 프로젝트에서는 YouTube captions 우선 전사와 로컬 Whisper CLI fallback을 추가한다.

필수:

- `GEMINI_API_KEY`: 하이라이트 점수화, 영상 노트, 메타데이터, 썸네일 카피 생성.
- `GEMINI_MODEL`: 기본 Gemini 모델.
- `YTDLP_BIN`: YouTube 자막 수집용 `yt-dlp` 실행 파일명 또는 경로. 기본 `yt-dlp`.
- `TRANSCRIPT_LANGUAGE`: 기본 자막 언어. 기본 `ko`.
- `WHISPER_CLI_BIN`: YouTube 자막/수동 자막이 없을 때 사용하는 로컬 Whisper CLI. 기본 `whisper`.
- `WHISPER_MODEL`: 로컬 Whisper 모델. 기본 `medium`.
- `WHISPER_LANGUAGE`: Whisper fallback 언어. 기본 `ko`.

선택:

- `OPENAI_API_KEY`: 외부 전사/분석 fallback.
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`: YouTube 업로드/썸네일 설정.
- `PIXABAY_API_KEY`, `PEXELS_API_KEY`: 썸네일/배경용 무료 이미지 검색.
- `VERTEX_AI_API_KEY`, `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_KEY_JSON`: Imagen/Lyria 등 Vertex AI 기능.
- `JAMENDO_CLIENT_ID`: BGM 검색.
- `FIREBASE_ADMIN_KEY_JSON`: 영상/이미지 호스팅.
- `INSTA_ACCOUNT_ID`, `INSTA_ACCESS_TOKEN`, `INSTA_API_VERSION`: 후속 Instagram 발행.
- `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_ACCESS_TOKEN`, `CANVA_REFRESH_TOKEN`: Canva 자산 연동.
- `NEWS_API_KEY`: 주제/뉴스 보강.
- `SLACK_SIGNING_SECRET`: 알림 연동.

### 8.7 주요 모듈

- `lib/video/source.ts`: URL/파일 입력 분석.
- `lib/video/download.ts`: 유튜브 다운로드 또는 로컬 파일 등록.
- `lib/video/audio.ts`: 오디오 추출, 길이 확인.
- `lib/transcript/*`: 전사 어댑터와 transcript schema.
- `lib/transcript/youtube-captions.ts`: `yt-dlp` 기반 YouTube 수동/자동 자막 수집. MVP의 기본 YouTube 전사 경로.
- `lib/transcript/subtitle-parser.ts`: SRT/VTT 파싱.
- `lib/transcript/whisper-cli.ts`: 로컬 Whisper CLI fallback 전사.
- `lib/notes/*`: 전체 요약, 섹션 노트, 핵심 주장, 키워드 생성.
- `lib/highlights/*`: 후보 생성, 점수화, 중복 제거.
- `lib/thumbnails/*`: 후킹 썸네일 카피 생성, 프레임 추출, 후보 렌더링, 점수화.
- `lib/shorts/render.ts`: 공통 렌더링 인터페이스.
- `lib/shorts/render-ffmpeg-template.ts`: ffmpeg template 기반 빠른 렌더링.
- `lib/shorts/render-remotion.ts`: Remotion 기반 고급 렌더링.
- `lib/render-graph/*`: Source/Combinator/Sink 기반 내부 렌더 그래프.
- `workers/python-analysis/*`: 선택형 파형/점수 그래프/분석 리포트 생성.
- `remotion/templates/ShortClip/*`: 세로형 쇼츠 템플릿.
- `app/page.tsx`: 입력, 후보 검토, 렌더링 화면.

## 9. 데이터 모델 초안

```ts
type Project = {
  id: string;
  sourceType: 'youtube' | 'local';
  sourceUrl?: string;
  sourcePath?: string;
  title: string;
  durationSec: number;
  createdAt: string;
};

type TranscriptSegment = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  confidence?: number;
};

type HighlightCandidate = {
  id: string;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
  hook: string;
  title: string;
  description: string;
  hashtags: string[];
  transcriptSegmentIds: string[];
};

type VideoNote = {
  summary: string;
  sections: Array<{
    startSec: number;
    endSec: number;
    title: string;
    summary: string;
    keyClaims: string[];
  }>;
  keywords: string[];
  questions: string[];
};

type RenderJob = {
  id: string;
  projectId: string;
  candidateId: string;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  outputPath?: string;
  error?: string;
};

type ThumbnailCandidate = {
  id: string;
  candidateId: string;
  style: 'shock' | 'question' | 'benefit';
  frameSec: number;
  headline: string;
  subline?: string;
  score: number;
  reason: string;
  imagePath: string;
};
```

## 10. MVP 범위

### 반드시 포함

- 로컬 Next.js 앱.
- 유튜브 URL 또는 로컬 파일 입력.
- ffmpeg 기반 오디오 추출.
- YouTube 수동 자막, YouTube 자동 자막, 수동 SRT/VTT, 로컬 Whisper CLI 순서의 전사 파이프라인.
- transcript JSON/SRT 수동 입력 fallback.
- 하이라이트 후보 자동 생성.
- 후보 리스트/미리보기 UI.
- Remotion 기반 1080x1920 쇼츠 렌더링.
- 자막 합성.
- 후킹 썸네일 후보 3개 이상 생성.
- 결과 파일 저장.

### 후순위

- 얼굴 추적 기반 자동 크롭.
- YouTube Shorts 자동 업로드.
- Instagram/TikTok 업로드.
- 팀 계정/클라우드 저장소.
- A/B 썸네일 생성.
- 다국어 번역 쇼츠.

## 11. 성공 지표

- 30분짜리 영상에서 5개 이상의 후보를 생성할 수 있다.
- 사용자가 후보를 선택해 최소 1개의 쇼츠 MP4를 생성할 수 있다.
- 생성된 쇼츠가 YouTube Shorts 권장 규격인 9:16, 60초 이하로 출력된다.
- 전사/분석/렌더링 중 실패한 단계가 UI와 로그에 명확히 표시된다.

## 12. 리스크와 대응

- 유튜브 다운로드 제한: 로컬 파일 업로드를 대체 경로로 제공한다.
- 전사 비용/속도: 캐시와 transcript 수동 입력을 지원한다.
- 하이라이트 품질 편차: AI 점수와 사용자 수동 조정을 함께 제공한다.
- 세로 크롭 품질: MVP는 center crop/fit blur를 우선 제공하고, 얼굴 추적은 후속 기능으로 둔다.
- 긴 영상 처리 시간: 단계별 캐시와 진행률 표시를 제공한다.

## 13. 구현 단계 제안

1. 프로젝트 스캐폴딩: Next.js, TypeScript, Remotion, ffmpeg 실행 확인.
2. 입력 파이프라인: URL/파일 등록, 메타데이터 추출, 프로젝트 폴더 생성.
3. 전사 파이프라인: YouTube 자막 우선 수집, 수동 SRT/VTT fallback, 로컬 Whisper CLI fallback, transcript schema 저장.
4. 하이라이트 엔진: transcript 기반 후보 생성과 LLM 점수화.
5. 후킹 썸네일 엔진: 프레임 추출, 카피 생성, 후보 렌더링, 점수화.
6. 쇼츠 템플릿: 9:16 영상, 원본 클립 삽입, 자막 렌더링.
7. UI: 입력 화면, 후보 검토, 썸네일 선택, 렌더링 실행, 결과 다운로드/열기.
8. 품질 개선: 자막 스타일, 제목/설명 생성, 캐시, 에러 처리.
