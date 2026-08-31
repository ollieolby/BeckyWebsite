// The Vercel project has the store ID saved as OPEN_AI_VECTOR_STORE_ID, so
// accept that spelling alongside the canonical OPENAI_VECTOR_STORE_ID.
export function openAiVectorStoreId() {
  return process.env.OPENAI_VECTOR_STORE_ID || process.env.OPEN_AI_VECTOR_STORE_ID || '';
}
