import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/supabase/server';
import { DEFAULT_AI_MODEL, isAllowedAiModel } from '@/lib/ai-models';
import { apiError } from '@/lib/api-error';

export async function POST(request: Request) {
  try {
    await requireUser();
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VECTOR_STORE_ID) {
      return NextResponse.json({ error: 'Ask Becky has not been connected yet.' }, { status: 503 });
    }
    const { question, model } = await request.json();
    if (!question || String(question).length > 1000) return NextResponse.json({ error: 'Enter a shorter question.' }, { status: 400 });
    if (model !== undefined && !isAllowedAiModel(model)) return NextResponse.json({ error: 'That AI model is not available.' }, { status: 400 });
    const openai = new OpenAI();
    const response = await openai.responses.create({
      model: isAllowedAiModel(model) ? model : (isAllowedAiModel(process.env.OPENAI_MODEL) ? process.env.OPENAI_MODEL : DEFAULT_AI_MODEL),
      instructions: 'You are Becky, a careful assistant for two families sharing a houseboat, garden and runaround boat. Answer only from retrieved family documents. Cite filenames. If the answer is absent, say so clearly. Never invent safety instructions.',
      input: String(question),
      tools: [{ type: 'file_search', vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID], max_num_results: 6 }],
      store: false,
    });
    return NextResponse.json({ answer: response.output_text, model: response.model });
  } catch (error) {
    return apiError(error, 'Unable to answer.');
  }
}
