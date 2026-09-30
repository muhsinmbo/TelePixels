/**
 * Gemini wrapper. AI is optional: without GEMINI_API_KEY every /ai route that
 * needs the model answers 503 with a clear message; context/template/previous
 * routes (pure data) keep working so the workflow is testable offline.
 */
import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export function aiEnabled(): boolean {
  return !!(process.env.GEMINI_API_KEY || '').trim();
}

function getClient(): GoogleGenAI {
  if (!aiEnabled()) {
    const err: any = new Error('AI disabled: set GEMINI_API_KEY in backend/.env');
    err.status = 503;
    throw err;
  }
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return client;
}

export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await ai.models.generateContent({
    model,
    config: { temperature: 0.2, maxOutputTokens: 4096 },
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] },
    ],
  });
  return (res.text || '').trim();
}

const SAFETY = `You assist radiologists and sonographers with report drafting.
Rules: never invent, infer, or embellish clinical findings. Use only facts explicitly supplied in the clinician's notes.
Preserve every supplied positive and negative finding, measurement, unit, laterality, and uncertainty exactly. Expand shorthand only when its meaning is unambiguous.
Do not add normal findings for anatomy the clinician did not mention. Do not use age, sex, modality, prior reports, or the template as evidence of current findings.
Never state or imply a diagnosis beyond what the supplied findings support. Keep the impression focused and concise.`;

export async function draftSkeleton(ctx: object, template: object): Promise<string> {
  return generateText(
    `${SAFETY} Produce a report skeleton: section headings from the template with their placeholder hints and normal-range prompts. No findings, no impression content — structure only. Return Markdown.`,
    `STUDY CONTEXT:\n${JSON.stringify(ctx, null, 2)}\n\nTEMPLATE:\n${JSON.stringify(template, null, 2)}`
  );
}

export async function polishFindings(ctx: object, templateTitle: string, rawFindings: string, previousSummaries: string[]): Promise<string> {
  return generateText(
    `${SAFETY}
Create a thorough, clinically structured draft that captures all available detail without repeating points.
Organize findings under the relevant sections from the matched template when appropriate. Keep each statement traceable to the current clinician notes; if the notes are brief, keep the report appropriately brief rather than filling gaps.
The impression should summarize only the supported key findings and must not introduce a new diagnosis or recommendation.
Return only Markdown with exactly these headings: "## Findings" and "## Impression". Do not add a preface, disclaimer, placeholders, or facts that are not in the notes.`,
    `STUDY CONTEXT (formatting only; not evidence): ${JSON.stringify(ctx)}\nTEMPLATE: ${templateTitle}\n\nCURRENT CLINICIAN NOTES (source of findings):\n${rawFindings}\n\nPRIOR REPORT IMPRESSIONS (continuity only; never use as current findings):\n${previousSummaries.join('\n---\n') || '(none)'}`
  );
}
