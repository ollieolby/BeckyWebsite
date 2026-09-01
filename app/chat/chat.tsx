'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/lib/ai-models';

type Source = { id: string; title: string; mime_type: string };
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[]; failed?: boolean };

const STORAGE_KEY = 'becky-chat-v1';
const SUGGESTIONS = [
  'How is the river looking today?',
  'Plan a day trip from home to Henley and back.',
  'Where is the fuel shut-off?',
  'Which pubs can we moor at?',
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<{ message: number; source: Source } | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const askedFromUrl = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Restore the conversation this browser was last having. localStorage is
  // only readable after mount, so this must be an effect, not initial state.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of persisted state
      if (saved?.messages?.length) { setMessages(saved.messages); messagesRef.current = saved.messages; }
      if (saved?.model && AI_MODELS.some(option => option.id === saved.model)) setModel(saved.model);
    } catch { /* start fresh */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, model })); } catch { /* private mode */ }
  }, [messages, model]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const history: Message[] = [...messagesRef.current, { role: 'user', content: question }];
    setMessages(history);
    setInput('');
    setLoading(true);
    setViewing(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), model }),
      });
      let result: Record<string, unknown> = {};
      try { result = await response.json(); } catch { /* non-JSON error page */ }
      if (response.status === 401) {
        setMessages([...history, { role: 'assistant', content: 'Please [sign in](/login) to ask Becky.', failed: true }]);
      } else if (!response.ok || typeof result.answer !== 'string') {
        setMessages([...history, { role: 'assistant', content: typeof result.error === 'string' ? result.error : 'Becky could not answer that. Try again.', failed: true }]);
      } else {
        setMessages([...history, { role: 'assistant', content: result.answer, sources: Array.isArray(result.sources) ? result.sources as Source[] : [] }]);
      }
    } catch {
      setMessages([...history, { role: 'assistant', content: 'Becky could not connect. Check your signal and try again.', failed: true }]);
    } finally {
      setLoading(false);
    }
  }, [loading, model]);

  // A question handed over from the homepage ask box (?q=…).
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !askedFromUrl.current) {
      askedFromUrl.current = true;
      window.history.replaceState(null, '', '/chat');
      send(q);
    }
  }, [searchParams, send]);

  function submit(event: FormEvent) { event.preventDefault(); send(input); }
  function newChat() { setMessages([]); setViewing(null); setInput(''); try { localStorage.removeItem(STORAGE_KEY); } catch { /* fine */ } }

  return (
    <div className="chat-page">
      <header className="chat-header">
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <strong className="chat-title">Ask Becky</strong>
        <div className="chat-controls">
          <select aria-label="AI model" value={model} onChange={event => setModel(event.target.value as typeof model)} disabled={loading}>
            {AI_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button type="button" onClick={newChat} disabled={loading && !messages.length}>New chat</button>
        </div>
      </header>

      <main className="chat-thread">
        {!messages.length && (
          <div className="chat-empty">
            <span className="sparkle" aria-hidden="true">✦</span>
            <h1>What do you want to know?</h1>
            <p>Becky answers from the family manuals, guides, saved places, live river data and the Thames lock tables — and links the manuals it used, diagrams and all.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" onClick={() => send(suggestion)}>{suggestion}</button>)}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <article key={index} className={`chat-message ${message.role}${message.failed ? ' failed' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {!!message.sources?.length && (
              <div className="chat-sources">
                <span>Sources:</span>
                {message.sources.map(source => (
                  <button
                    key={source.id} type="button"
                    className={viewing?.message === index && viewing.source.id === source.id ? 'active' : ''}
                    onClick={() => setViewing(viewing?.message === index && viewing.source.id === source.id ? null : { message: index, source })}
                  >
                    📄 {source.title}
                  </button>
                ))}
              </div>
            )}
            {viewing?.message === index && (
              <div className="chat-viewer">
                <div className="chat-viewer-bar">
                  <strong>{viewing.source.title}</strong>
                  <span>
                    <a href={`/api/documents/${viewing.source.id}/file`} target="_blank" rel="noreferrer">Open full size ↗</a>
                    <button type="button" onClick={() => setViewing(null)}>Close ✕</button>
                  </span>
                </div>
                <iframe title={viewing.source.title} src={`/api/documents/${viewing.source.id}/file`} />
              </div>
            )}
          </article>
        ))}
        {loading && <article className="chat-message assistant thinking">Becky is thinking…</article>}
        <div ref={endRef} />
      </main>

      <form className="chat-input" onSubmit={submit}>
        <input
          value={input} onChange={event => setInput(event.target.value)}
          placeholder="Ask about the boats, the river, or a day out…"
          aria-label="Ask Becky a question" maxLength={1000}
        />
        <button type="submit" disabled={loading || !input.trim()}>{loading ? '…' : 'Send'}</button>
      </form>
    </div>
  );
}
