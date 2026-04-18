import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  onSend:   (text: string) => void;
  onClose:  () => void;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function MessageBody({ text }: { text: string }) {
  const parts: Array<{ kind: 'text' | 'url'; value: string }> = [];
  let lastIdx = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index === undefined) continue;
    if (m.index > lastIdx) parts.push({ kind: 'text', value: text.slice(lastIdx, m.index) });
    parts.push({ kind: 'url', value: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ kind: 'text', value: text.slice(lastIdx) });

  async function openExternal(url: string) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'url' ? (
          <a key={i} href={p.value} className="chat-link"
            onClick={e => { e.preventDefault(); void openExternal(p.value); }}>
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

export default function ChatPanel({ messages, onSend, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when a new message arrives
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function send() {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>Chat</span>
        <button className="icon-btn" onClick={onClose} title="Close chat" style={{ fontSize: 14 }}>✕</button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet — say hi.</p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-message${m.isLocal ? ' is-local' : ''}`}>
            <div className="chat-meta">
              <span className="chat-from">{m.isLocal ? 'You' : (m.fromName || m.from)}</span>
              <span className="chat-time">{formatTime(m.timestamp)}</span>
            </div>
            <div className="chat-body"><MessageBody text={m.text} /></div>
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message…"
          autoFocus
        />
        <button className="btn-primary chat-send" onClick={send} disabled={!draft.trim()}>Send</button>
      </div>
    </div>
  );
}
