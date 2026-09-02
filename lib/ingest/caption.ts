import OpenAI from 'openai';
import type { RawFigure } from './extract.ts';

// Proposing a label, caption and keywords for a figure by looking at it.
//
// This is the job that was done by hand for the first six documents, and it
// is the whole reason figure retrieval works: the manual's photographs have
// no captions, so without a description written from the image there is
// nothing to match a reader's question against.
//
// Captions produced here are never published. They land for review, because
// a figure sent with a confidently wrong caption is worse than no figure.

export type ProposedCaption = {
  label: string;
  caption: string;
  keywords: string[];
  /** The model's own note about anything it could not make out. */
  uncertain: string;
};

// Vision is not available on every model, and the chat models are chosen for
// cost. Kept separate and overridable so the captioner can be pointed at a
// model that can actually see.
export const CAPTION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-5.4-mini';

const INSTRUCTIONS = `You are labelling a photograph or diagram from a family's boat manual so that an assistant can find it later and send it to the right person.

You are given the image, the heading it sits under, and the sentences immediately before and after it. The manual's photographs have no captions: the surrounding text is usually the only clue to what is being pointed at.

Return:
- label: a short noun phrase naming the thing shown, as a person would refer to it. Include a brand or model name if it is legible in the image. Never start with "Figure" or a number.
- caption: one or two sentences describing what is actually visible, including where it is on the boat if the text says, and any annotation drawn on the photo (a green circle, a red arrow) and what it marks. Describe only what you can see or what the surrounding text states.
- keywords: 8 to 15 search terms a family member might actually type - common names, synonyms, the fault they would be trying to fix ("overheating", "won't start"), and any brand names. Lower case.
- uncertain: anything you could not make out, or where you are guessing from the text rather than the image. Empty string if none.

Be concrete and specific. Do not invent labels on switches you cannot read, do not guess model numbers, and do not describe safety procedures that are not in the text you were given.`;

export async function proposeCaption(figure: RawFigure, documentTitle: string): Promise<ProposedCaption> {
  const openai = new OpenAI();
  const context = [
    `Document: ${documentTitle}`,
    figure.section ? `Section: ${figure.section}` : '',
    figure.page ? `Sheet/page: ${figure.page}` : '',
    figure.contextBefore ? `Text immediately before the figure: ${figure.contextBefore}` : '',
    figure.contextAfter ? `Text immediately after the figure: ${figure.contextAfter}` : '',
  ].filter(Boolean).join('\n');

  const response = await openai.responses.create({
    model: CAPTION_MODEL,
    instructions: INSTRUCTIONS,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: context },
        { type: 'input_image', image_url: `data:image/jpeg;base64,${figure.image.toString('base64')}`, detail: 'auto' },
      ],
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'figure_caption',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            caption: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            uncertain: { type: 'string' },
          },
          required: ['label', 'caption', 'keywords', 'uncertain'],
          additionalProperties: false,
        },
      },
    },
    store: false,
  });

  const parsed = JSON.parse(response.output_text || '{}') as Partial<ProposedCaption>;
  const words: string[] = Array.isArray(parsed.keywords)
    ? parsed.keywords.map(word => String(word).toLowerCase().trim()).filter(Boolean)
    : [];
  return {
    label: String(parsed.label ?? '').trim().slice(0, 160) || `Figure ${figure.index}`,
    caption: String(parsed.caption ?? '').trim().slice(0, 1200),
    keywords: [...new Set(words)].slice(0, 20),
    uncertain: String(parsed.uncertain ?? '').trim().slice(0, 600),
  };
}

// A figure that could not be captioned still gets a row, so it appears in the
// review queue with its image rather than vanishing.
export function fallbackCaption(figure: RawFigure, reason: string): ProposedCaption {
  const hint = figure.contextBefore || figure.section;
  return {
    label: figure.section ? `${figure.section} - figure ${figure.index}` : `Figure ${figure.index}`,
    caption: hint ? `Not yet described. The manual says just before it: "${hint.slice(0, 300)}"` : 'Not yet described.',
    keywords: [],
    uncertain: `Automatic captioning failed (${reason}). Needs a description written by hand.`,
  };
}
