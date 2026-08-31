import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    await requireUser();
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VECTOR_STORE_ID) {
      return NextResponse.json({ error: 'Ask Becky has not been connected yet.' }, { status: 503 });
    }
    const { question } = await request.json();
    if (!question || String(question).length > 1000) return NextResponse.json({ error: 'Enter a shorter question.' }, { status: 400 });
    const openai = new OpenAI();
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions: 'You are Becky, a careful assistant for two families sharing a houseboat, garden and runaround boat. Answer only from retrieved family documents. Cite filenames. If the answer is absent, say so clearly. Never invent safety instructions.',
      input: String(question),
      tools: [{ type: 'file_search', vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID], max_num_results: 6 }],
    });
    return NextResponse.json({ answer: response.output_text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to answer.';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
