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
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] },
    ],
  });
  return (res.text || '').trim();
}

const SAFETY = `You assist radiologists and sonographers with report drafting.
Rules: never invent clinical findings; only organize and polish what the clinician provided.
Never state or imply a diagnosis beyond the provided findings. Keep language professional and concise.`;

export async function draftSkeleton(ctx: object, template: object): Promise<string> {
  return generateText(
    `${SAFETY} Produce a report skeleton: section headings from the template with their placeholder hints and normal-range prompts. No findings, no impression content — structure only. Return Markdown.`,
    `STUDY CONTEXT:\n${JSON.stringify(ctx, null, 2)}\n\nTEMPLATE:\n${JSON.stringify(template, null, 2)}`
  );
}

export async function polishFindings(ctx: object, templateTitle: string, rawFindings: string, previousSummaries: string[]): Promise<string> {
  return generateText(
    `${SAFETY} Turn the clinician's raw observation notes into a structured report with Findings (organized by section) and Impression (most relevant conclusion first). Do not add observations that are not in the notes. Previous reports are background only. Return Markdown with "## Findings" and "## Impression" sections.`,
    `CONTEXT: ${JSON.stringify(ctx)}\nTEMPLATE: ${templateTitle}\n\nCLINICIAN NOTES:\n${rawFindings}\n\nPREVIOUS (background):\n${previousSummaries.join('\n---\n') || '(none)'}`
  );
}
