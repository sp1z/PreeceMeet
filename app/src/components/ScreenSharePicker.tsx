import { useState } from 'react';
import type { DisplayShareSource } from '../runtime';

interface Props {
  sources:  DisplayShareSource[];
  onSelect: (sourceId: string) => void;
  onCancel: () => void;
}

export default function ScreenSharePicker({ sources, onSelect, onCancel }: Props) {
  const [tab, setTab] = useState<'screen' | 'window'>('screen');

  const screens = sources.filter(s => s.isScreen);
  const windows = sources.filter(s => !s.isScreen);
  const list    = tab === 'screen' ? screens : windows;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="share-picker" onClick={e => e.stopPropagation()}>
        <div className="share-picker-header">
          <span>Share your screen</span>
          <button className="share-picker-close" onClick={onCancel} title="Cancel">✕</button>
        </div>

        <div className="share-picker-tabs">
          <button
            className={`share-picker-tab${tab === 'screen' ? ' active' : ''}`}
            onClick={() => setTab('screen')}
          >
            Entire screen{screens.length ? ` (${screens.length})` : ''}
          </button>
          <button
            className={`share-picker-tab${tab === 'window' ? ' active' : ''}`}
            onClick={() => setTab('window')}
          >
            Window{windows.length ? ` (${windows.length})` : ''}
          </button>
        </div>

        <div className="share-picker-grid">
          {list.length === 0 && (
            <div className="share-picker-empty">
              {tab === 'screen' ? 'No screens detected.' : 'No shareable windows.'}
            </div>
          )}
          {list.map(src => (
            <button
              key={src.id}
              className="share-picker-card"
              onClick={() => onSelect(src.id)}
              title={src.name}
            >
              <div className="share-picker-thumb">
                {src.thumbnail
                  ? <img src={src.thumbnail} alt={src.name} draggable={false} />
                  : <div className="share-picker-thumb-empty">{src.isScreen ? '🖥' : '🪟'}</div>}
              </div>
              <div className="share-picker-name">{src.name}</div>
            </button>
          ))}
        </div>

        <div className="share-picker-footer">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
