import type { HighlightCandidate } from './generate.js';

interface GeminiRankItem {
  id: string;
  score: number;
  title: string;
  reason: string;
}

const parseJson = (text: string): GeminiRankItem[] => {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  return JSON.parse(text.slice(start, end + 1)) as GeminiRankItem[];
};

export const rerankHighlightsByContent = async (
  candidates: HighlightCandidate[],
  opts: { count: number; videoTitle?: string }
): Promise<HighlightCandidate[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || candidates.length === 0) {
    return candidates.slice(0, opts.count);
  }

  const compact = candidates.slice(0, Math.min(candidates.length, 24)).map((candidate) => ({
    id: candidate.id,
    startSec: candidate.startSec,
    endSec: candidate.endSec,
    text: candidate.text.slice(0, 900),
  }));

  const prompt = `너는 강의/교육 영상을 YouTube Shorts로 편집하는 콘텐츠 PD다.

목표: 반응용 멘트가 아니라 "내용상 중요한 부분"을 고른다.

평가 기준:
- 핵심 개념, 원리, 기준, 프레임워크를 설명하는가
- 시청자가 바로 적용할 수 있는 방법/단계/체크포인트가 있는가
- 앞뒤 맥락 없이도 하나의 메시지로 독립적인가
- 반복, 잡담, 질문 유도, 단순 맞장구, 분위기 전환 멘트는 낮게 본다
- 제목은 과장하지 말고 내용의 핵심을 35자 이내 한국어로 쓴다

영상 제목: ${opts.videoTitle || 'unknown'}

후보:
${JSON.stringify(compact, null, 2)}

JSON 배열만 응답:
[
  {"id":"...", "score":95, "title":"...", "reason":"..."}
]`;

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const ranked = parseJson(text);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    return ranked
      .map((rank) => {
        const candidate = byId.get(rank.id);
        if (!candidate) return null;
        return {
          ...candidate,
          score: rank.score,
          title: `${rank.title.replace(/#Shorts/i, '').slice(0, 60)} #Shorts`,
          reason: rank.reason,
        };
      })
      .filter((candidate): candidate is HighlightCandidate => candidate !== null)
      .slice(0, opts.count);
  } catch (error) {
    console.warn(
      '[highlights] Gemini content rerank failed, using local content scoring:',
      error instanceof Error ? error.message : error
    );
    return candidates.slice(0, opts.count);
  }
};
