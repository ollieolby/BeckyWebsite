'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Source = { id: string; title: string; mime_type: string };
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[]; failed?: boolean };
type Conversation = { id: string; title: string; updated_at: string };

const MODEL_KEY = 'becky-chat-model';
const SUGGESTIONS = [
  'How is the river looking today?',
  'Plan a day trip from home to Henley and back.',
  'Where is the fuel shut-off?',
  'What problems have we had before?',
];

export default function Chat() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<{ message: number; source: Source } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const askedFromUrl = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);
  useEffect(() => {
    try { localStorage.setItem(MODEL_KEY, model); } catch { /* private mode */ }
  }, [model]);

  // Sign-in check, saved model, and the conversation list for the sidebar.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      try {
        const saved = localStorage.getItem(MODEL_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of persisted state
        if (saved && AI_MODELS.some(option => option.id === saved)) setModel(saved as typeof model);
      } catch { /* private mode */ }
      const { data: { user } } = await supabase.auth.getUser();
      userIdRef.current = user?.id ?? null;
      setSignedIn(!!user);
      if (!user) return;
      const { data } = await supabase.from('conversations').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(100);
      setConversations(data ?? []);
    })();
  }, []);

  async function persist(nextMessages: Message[]) {
    const supabase = createSupabaseBrowserClient();
    if (!userIdRef.current) return;
    if (!activeIdRef.current) {
      const firstQuestion = nextMessages.find(message => message.role === 'user')?.content ?? 'New chat';
      const { data } = await supabase.from('conversations')
        .insert({ user_id: userIdRef.current, title: firstQuestion.slice(0, 80), messages: nextMessages })
        .select('id,title,updated_at').single();
      if (data) {
        activeIdRef.current = data.id;
        setActiveId(data.id);
        setConversations(current => [data, ...current]);
      }
    } else {
      const updatedAt = new Date().toISOString();
      await supabase.from('conversations').update({ messages: nextMessages, updated_at: updatedAt }).eq('id', activeIdRef.current);
      setConversations(current => {
        const rest = current.filter(item => item.id !== activeIdRef.current);
        const active = current.find(item => item.id === activeIdRef.current);
        return active ? [{ ...active, updated_at: updatedAt }, ...rest] : current;
      });
    }
  }

  async function openConversation(id: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from('conversations').select('messages').eq('id', id).maybeSingle();
    setActiveId(id);
    setMessages(Array.isArray(data?.messages) ? data.messages as Message[] : []);
    setViewing(null);
    setSidebarOpen(false);
  }

  async function deleteConversation(id: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from('conversations').delete().eq('id', id);
    setConversations(current => current.filter(item => item.id !== id));
    if (activeIdRef.current === id) { setActiveId(null); setMessages([]); setViewing(null); }
  }

  function newChat() { setActiveId(null); setMessages([]); setViewing(null); setInput(''); setSidebarOpen(false); }

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const history: Message[] = [...messagesRef.current, { role: 'user', content: question }];
    setMessages(history);
    setInput('');
    setLoading(true);
    setViewing(null);
    let next: Message[];
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), model }),
      });
      let result: Record<string, unknown> = {};
      try { result = await response.json(); } catch { /* non-JSON error page */ }
      if (response.status === 401) {
        next = [...history, { role: 'assistant', content: 'Please [sign in](/login) to ask Becky.', failed: true }];
      } else if (!response.ok || typeof result.answer !== 'string') {
        next = [...history, { role: 'assistant', content: typeof result.error === 'string' ? result.error : 'Becky could not answer that. Try again.', failed: true }];
      } else {
        next = [...history, { role: 'assistant', content: result.answer, sources: Array.isArray(result.sources) ? result.sources as Source[] : [] }];
      }
    } catch {
      next = [...history, { role: 'assistant', content: 'Becky could not connect. Check your signal and try again.', failed: true }];
    }
    setMessages(next);
    setLoading(false);
    persist(next).catch(() => { /* history is a convenience; the answer still showed */ });
  }, [loading, model]);

  // A question handed over from the homepage ask box (?q=…).
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !askedFromUrl.current && signedIn !== null) {
      askedFromUrl.current = true;
      window.history.replaceState(null, '', '/chat');
      send(q);
    }
  }, [searchParams, send, signedIn]);

  function submit(event: FormEvent) { event.preventDefault(); send(input); }

  if (signedIn === false) {
    return (
      <div className="chat-page">
        <header className="chat-header">
          <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
          <strong className="chat-title">Ask Becky</strong>
        </header>
        <div className="chat-empty" style={{ margin: 'auto' }}>
          <span className="sparkle" aria-hidden="true">✦</span>
          <h1>Family sign-in needed</h1>
          <p>Ask Becky answers from the family&rsquo;s own manuals and river data, so it is for signed-in family members.</p>
          <p><a className="chat-signin" href="/login">Sign in →</a></p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <header className="chat-header">
        <button type="button" className="chat-menu" aria-label="Chat history" onClick={() => setSidebarOpen(open => !open)}>☰</button>
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <strong className="chat-title">Ask Becky</strong>
        <div className="chat-controls">
          <select aria-label="AI model" value={model} onChange={event => setModel(event.target.value as typeof model)} disabled={loading}>
            {AI_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      </header>

      <div className="chat-body">
        <aside className={`chat-sidebar${sidebarOpen ? ' open' : ''}`}>
          <button type="button" className="chat-new" onClick={newChat}>+ New chat</button>
          <nav aria-label="Chat history">
            {conversations.map(conversation => (
              <div key={conversation.id} className={`chat-history-item${conversation.id === activeId ? ' active' : ''}`}>
                <button type="button" className="chat-history-title" onClick={() => openConversation(conversation.id)}>{conversation.title}</button>
                <button type="button" className="chat-history-delete" aria-label={`Delete "${conversation.title}"`} onClick={() => deleteConversation(conversation.id)}>✕</button>
              </div>
            ))}
            {!conversations.length && <p className="chat-history-empty">Your past chats will appear here.</p>}
          </nav>
        </aside>

        <div className="chat-main">
          <main className="chat-thread">
            {!messages.length && (
              <div className="chat-empty">
                <span className="sparkle" aria-hidden="true">✦</span>
                <h1>What do you want to know?</h1>
                <p>Becky answers from the family manuals, guides, saved places, troubleshooting log, live river data and the Thames lock tables — and links the manuals it used, diagrams and all. It can also log problems and fixes for you.</p>
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
      </div>
    </div>
  );
}
