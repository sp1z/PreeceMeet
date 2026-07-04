import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import { openExternal } from '../runtime';
import { CloseIcon, SendIcon } from './icons';

interface Props {
  messages: ChatMessage[];
  roomName?: string;
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

// Deterministic per-name pastel colour so remote senders are visually distinct
// without a full user-colour palette. Cyan and blue reserved for own message /
// URLs / active-speaker — remotes get warmer hues.
const REMOTE_HUES = ['#8FBFFF', '#7FD6A8', '#F5C57A', '#E29ADB', '#9EB4FF', '#7FD9F4'];
function colourFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return REMOTE_HUES[Math.abs(h) % REMOTE_HUES.length];
}

export default function ChatPanel({ messages, roomName, onSend, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

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
        <span className="chat-header-title">Chat</span>
        {roomName && <span className="chat-header-room mono">#{roomName}</span>}
        <button className="chat-close" onClick={onClose} title="Close chat" aria-label="Close chat">
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet — say hi.</p>
        )}
        {messages.map(m => {
          const senderName = m.isLocal ? 'You' : (m.fromName || m.from);
          const nameColor = m.isLocal ? '#8FDCFF' : colourFor(senderName);
          return (
            <div key={m.id} className={`chat-message${m.isLocal ? ' is-local' : ''}`}>
              <div className="chat-meta">
                <span className="chat-from" style={{ color: nameColor }}>{senderName}</span>
                <span className="chat-time mono">{formatTime(m.timestamp)}</span>
              </div>
              <div className="chat-body"><MessageBody text={m.text} /></div>
            </div>
          );
        })}
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={roomName ? `Message #${roomName}` : 'Type a message…'}
          autoFocus
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={!draft.trim()}
          title="Send"
          aria-label="Send message"
        >
          <SendIcon size={18} />
        </button>
      </div>
    </div>
  );
}
