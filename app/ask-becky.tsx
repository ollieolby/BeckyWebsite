'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

// The homepage ask box hands the question to the full chat page at /chat.
export default function AskBecky() {
  const [question, setQuestion] = useState('');
  const router = useRouter();

  function ask(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    router.push(q ? `/chat?q=${encodeURIComponent(q)}` : '/chat');
  }

  return <>
    <form className="ask-box" onSubmit={ask}>
      <span className="sparkle" aria-hidden="true">✦</span>
      <label className="sr-only" htmlFor="question">Ask a question</label>
      <input id="question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="How do I start the heating?" />
      <button type="submit">Ask Becky <span>→</span></button>
    </form>
    <p className="try-it">Try asking: <button onClick={() => router.push(`/chat?q=${encodeURIComponent('Where is the fuel shut-off?')}`)}>Where is the fuel shut-off?</button> <i>·</i> <button onClick={() => router.push(`/chat?q=${encodeURIComponent('Plan a day trip from home to Henley and back.')}`)}>Plan a day out</button> <i>·</i> <a href="/chat">Open the chat</a></p>
  </>;
}
