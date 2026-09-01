'use client';
import { FormEvent, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/lib/ai-models';

export default function AskBecky() {
  const [question, setQuestion] = useState('');
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, model }),
      });
      const result = await response.json();
      if (response.status === 401) setAnswer('Please sign in to ask Becky.');
      else setAnswer(result.answer || result.error || 'Becky could not answer that yet.');
    } catch { setAnswer('Becky could not connect. Please try again.'); }
    finally { setLoading(false); }
  }

  return <>
    <form className="ask-box" onSubmit={ask}>
      <span className="sparkle" aria-hidden="true">✦</span>
      <label className="sr-only" htmlFor="question">Ask a question</label>
      <input id="question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="How do I start the heating?" />
      <button type="submit" disabled={loading}>{loading ? 'Thinking…' : 'Ask Becky'} <span>→</span></button>
    </form>
    <label className="model-picker">Model
      <select value={model} onChange={event => setModel(event.target.value as typeof model)} disabled={loading}>
        {AI_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    {answer && <div className="ask-answer" role="status"><ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>{answer.startsWith('Please sign in') && <a href="/login">Sign in</a>}</div>}
    <p className="try-it">Try asking: <button onClick={() => setQuestion('Where is the fuel shut-off?')}>Where is the fuel shut-off?</button> <i>·</i> <button onClick={() => setQuestion('What is the best pub nearby?')}>Best pub nearby?</button></p>
  </>;
}
