import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/supabase/server';
import { DEFAULT_AI_MODEL, isAllowedAiModel } from '@/lib/ai-models';
import { apiError } from '@/lib/api-error';
import { openAiVectorStoreId } from '@/lib/env';
import { BECKY_TOOL_DEFINITIONS, runBeckyTool } from '@/lib/becky-tools';

export const runtime = 'nodejs';
// Tool-calling can take several model rounds; allow more than the default.
export const maxDuration = 60;

const INSTRUCTIONS = `You are Becky, a careful assistant for two families sharing a houseboat (Becky), a boat garden (Cormorant) and a runaround boat (Drakar) on the non-tidal River Thames.

Answer only from the family's own sources:
- file_search over the uploaded manuals and documents;
- list_places for saved moorings, pubs, cafés, shops and fuel stops;
- list_guides / read_guide for family-written guides;
- plan_thames_journey for any Thames distance, duration or lock-count question — always use it instead of doing the arithmetic yourself.

Cite the manual filename or guide title your answer came from. If the family sources do not contain the answer, say so clearly. Never invent facts, and never invent safety instructions.

Format answers in GitHub-flavoured Markdown. Use a table for itineraries, timings or comparisons, and keep answers short and practical.`;

export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser();
    const vectorStoreId = openAiVectorStoreId();
    if (!process.env.OPENAI_API_KEY || !vectorStoreId) {
      return NextResponse.json({ error: 'Ask Becky has not been connected yet.' }, { status: 503 });
    }
    const { question, model } = await request.json();
    if (!question || String(question).length > 1000) return NextResponse.json({ error: 'Enter a shorter question.' }, { status: 400 });
    if (model !== undefined && !isAllowedAiModel(model)) return NextResponse.json({ error: 'That AI model is not available.' }, { status: 400 });

    const openai = new OpenAI();
    const tools = [
      { type: 'file_search' as const, vector_store_ids: [vectorStoreId], max_num_results: 6 },
      ...BECKY_TOOL_DEFINITIONS,
    ];
    const input: OpenAI.Responses.ResponseInput = [{ role: 'user', content: String(question) }];
    let response = null;
    for (let round = 0; round < 6; round++) {
      response = await openai.responses.create({
        model: isAllowedAiModel(model) ? model : (isAllowedAiModel(process.env.OPENAI_MODEL) ? process.env.OPENAI_MODEL : DEFAULT_AI_MODEL),
        instructions: INSTRUCTIONS,
        input,
        tools,
        store: false,
      });
      const calls = response.output.filter(item => item.type === 'function_call');
      if (!calls.length) break;
      // Send the model's whole output back (reasoning items included), then
      // answer each function call so the next round can use the results.
      input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
      for (const call of calls) {
        let output: string;
        try {
          output = await runBeckyTool(call.name, JSON.parse(call.arguments || '{}'), supabase);
        } catch (error) {
          output = JSON.stringify({ error: error instanceof Error ? error.message : 'The tool failed.' });
        }
        input.push({ type: 'function_call_output', call_id: call.call_id, output });
      }
    }
    return NextResponse.json({ answer: response?.output_text || 'Becky could not put an answer together. Try rephrasing the question.', model: response?.model });
  } catch (error) {
    return apiError(error, 'Unable to answer.');
  }
}
