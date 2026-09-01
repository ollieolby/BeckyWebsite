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

const INSTRUCTIONS = `You are Becky, a careful assistant for two families sharing a houseboat (Becky), a boat garden (Cormorant) and a runaround boat (Drakar) on the non-tidal River Thames. The boats are moored near Bourne End, on the reach between Marlow Lock (upstream) and Cookham Lock (downstream) — plan_thames_journey understands "home".

Answer only from the family's own sources and the Environment Agency data:
- file_search over the uploaded manuals and documents;
- list_places for saved moorings, pubs, cafés, shops and fuel stops;
- list_notes for shared family facts, decisions, conclusions and memories saved manually or from earlier chats;
- list_guides / read_guide for family-written guides;
- plan_thames_journey for any Thames distance, duration or lock-count question — always use it instead of doing the arithmetic yourself;
- get_river_level and get_river_conditions for the live river state — check both before answering ANY question about going out, planning a trip, or whether boating is a good idea, and use them for "how is the river" questions;
- list_problems for the family troubleshooting log — always check it when helping diagnose a fault.

You can also write, when the user asks you to: log_problem to record a new fault, solve_problem to record what fixed one, and save_guide to write family knowledge down. Before any write, show the user the exact text you intend to save and get their agreement; after saving, confirm what was saved. If a write is refused, the user may have view-only access.

River safety policy, applied to every trip question:
- "Caution strong stream" (red boards) on any reach the trip uses, or the level above the gauge's typical range: say clearly that the trip should NOT go ahead, and why. Do not soften this into a "be careful" — the answer is no, wait for conditions to improve.
- "Caution stream increasing" or "Caution stream decreasing" (yellow boards) on the route: warn plainly that conditions are marginal, especially for upstream legs and less experienced crew, and suggest checking again before setting off.
- "No stream warnings" on the whole route and a normal level: fine to plan the trip.
Always state which reaches and reading the verdict came from, and remind the user conditions change — the boards are checked at the time of asking.

Day-out planning policy:
- For every day-out or trip-planning request, call list_places as well as plan_thames_journey and the two river-condition tools. Look for saved pubs, cafés, moorings and other stops that could be visited en route or used as the destination.
- Respect the user's whole available window. Include outbound cruising, locks, the return journey when applicable, and a sensible stop/meal allowance. If the user gives no stop allowance, state the allowance you assumed.
- Recommend a saved place only when the journey calculation or saved family notes provide enough evidence that it fits. Prefer places on or close to the planned route; do not add a detour merely because a place exists.
- If a saved place cannot be resolved by plan_thames_journey and its notes do not establish travel time or nearest lock, label it as an unverified nearby option instead of claiming it fits the schedule. Ask for its nearest lock or a known time from home when that would resolve the uncertainty.
- In the final itinerary, distinguish cruising/lock time from time ashore and show the total against the available window. Include at most three relevant saved-place suggestions, best fit first.

Cite the manual filename or guide title your answer came from, and mention the page number when the retrieved text shows one — the site links your cited manuals under the answer automatically. If the family sources do not contain the answer, say so clearly. Never invent facts, and never invent safety instructions.

Format answers in GitHub-flavoured Markdown. Use a table for itineraries, timings or comparisons, and keep answers short and practical.`;

type Source = { id: string; title: string; mime_type: string };

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const vectorStoreId = openAiVectorStoreId();
    if (!process.env.OPENAI_API_KEY || !vectorStoreId) {
      return NextResponse.json({ error: 'Ask Becky has not been connected yet.' }, { status: 503 });
    }
    const body = await request.json();
    const model = body.model;
    if (model !== undefined && !isAllowedAiModel(model)) return NextResponse.json({ error: 'That AI model is not available.' }, { status: 400 });
    // Accept a conversation ({messages: [{role, content}...]}) or a single
    // question ({question}) from the homepage box.
    const raw: unknown[] = Array.isArray(body.messages) ? body.messages.slice(-16) : (body.question ? [{ role: 'user', content: body.question }] : []);
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const item of raw) {
      const { role, content } = (item ?? {}) as { role?: unknown; content?: unknown };
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) continue;
      history.push({ role, content: content.slice(0, 8000) });
    }
    if (!history.length || history[history.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
    }
    if (history.reduce((total, message) => total + message.content.length, 0) > 24000) {
      return NextResponse.json({ error: 'This conversation is too long — start a new chat.' }, { status: 400 });
    }

    const openai = new OpenAI();
    const tools = [
      { type: 'file_search' as const, vector_store_ids: [vectorStoreId], max_num_results: 6 },
      ...BECKY_TOOL_DEFINITIONS,
    ];
    const input: OpenAI.Responses.ResponseInput = history.map(message => ({ role: message.role, content: message.content }));
    const citedFileIds = new Set<string>();
    let response = null;
    for (let round = 0; round < 6; round++) {
      response = await openai.responses.create({
        model: isAllowedAiModel(model) ? model : (isAllowedAiModel(process.env.OPENAI_MODEL) ? process.env.OPENAI_MODEL : DEFAULT_AI_MODEL),
        instructions: INSTRUCTIONS,
        input,
        tools,
        store: false,
        // Stateless mode: reasoning items must carry their content inline so
        // they can be echoed back in the next tool round.
        include: ['reasoning.encrypted_content'],
      });
      collectCitations(response, citedFileIds);
      const calls = response.output.filter(item => item.type === 'function_call');
      if (!calls.length) break;
      // Send the model's output back (reasoning items included), then answer
      // each function call so the next round can use the results. Built-in
      // tool call items (file_search_call) are server-state stubs that cannot
      // be resent with store:false — the API 404s on their ids — so drop them.
      input.push(...(response.output.filter(item => item.type !== 'file_search_call') as OpenAI.Responses.ResponseInputItem[]));
      for (const call of calls) {
        let output: string;
        try {
          output = await runBeckyTool(call.name, JSON.parse(call.arguments || '{}'), supabase, user.id);
        } catch (error) {
          output = JSON.stringify({ error: error instanceof Error ? error.message : 'The tool failed.' });
        }
        input.push({ type: 'function_call_output', call_id: call.call_id, output });
      }
    }

    // Map the cited OpenAI files back to our documents so the reader can open
    // the original manual (and its diagrams) straight from the answer.
    let sources: Source[] = [];
    if (citedFileIds.size) {
      const { data } = await supabase.from('documents').select('id,title,mime_type').in('openai_file_id', [...citedFileIds]);
      sources = (data ?? []) as Source[];
    }
    return NextResponse.json({
      answer: response?.output_text || 'Becky could not put an answer together. Try rephrasing the question.',
      model: response?.model,
      sources,
    });
  } catch (error) {
    return apiError(error, 'Unable to answer.');
  }
}

function collectCitations(response: OpenAI.Responses.Response, into: Set<string>) {
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type !== 'output_text') continue;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === 'file_citation' && annotation.file_id) into.add(annotation.file_id);
      }
    }
  }
}
