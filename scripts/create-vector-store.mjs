import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY before running this script.');
  process.exit(1);
}

const store = await new OpenAI().vectorStores.create({ name: 'Becky family knowledge base' });
console.log(`OPENAI_VECTOR_STORE_ID=${store.id}`);
