import { useState, useEffect } from 'react';
import type { Settings, Channel } from '../types';
import EmojiPicker from './EmojiPicker';
import pkg from '../../package.json';

interface Props {
  settings:     Settings;
  onSave:       (s: Settings) => void;
  onClose:      () => void;
  initialTab?:  'profile' | 'channels' | 'permissions';
}

type Tab       = 'profile' | 'channels' | 'permissions';
type PermState = 'unknown' | 'granted' | 'denied' | 'prompt';

export default function SettingsModal({ settings, onSave, onClose, initialTab }: Props) {
  const [tab,           setTab]           = useState<Tab>(initialTab ?? 'profile');
  const [displayName,   setDisplayName]   = useState(settings.displayName);
  const [avatarEmoji,   setAvatarEmoji]   = useState(settings.avatarEmoji || '🙂');
  const [serverUrl,     setServerUrl]     = useState(settings.serverUrl);
  const [channels,      setChannels]      = useState<Channel[]>([...settings.channels]);
  const [autoJoin,      setAutoJoin]      = useState(settings.autoJoinChannel);
  const [editingName,   setEditingName]   = useState<string | null>(null);
  const [editLabel,     setEditLabel]     = useState('');
  const [editEmoji,     setEditEmoji]     = useState('💬');
  const [newName,       setNewName]       = useState('');
  const [newLabel,      setNewLabel]      = useState('');
  const [newEmoji,      setNewEmoji]      = useState('💬');
  const [micState,      setMicState]      = useState<PermState>('unknown');
  const [camState,      setCamState]      = useState<PermState>('unknown');
  const [permMsg,       setPermMsg]       = useState('');
  const [micDevices,     setMicDevices]     = useState<MediaDeviceInfo[]>([]);
  const [camDevices,     setCamDevices]     = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [prefMic,        setPrefMic]        = useState(settings.preferredMicDeviceId);
  const [prefCam,        setPrefCam]        = useState(settings.preferredCamDeviceId);
  const [prefSpeaker,    setPrefSpeaker]    = useState(settings.preferredSpeakerDeviceId);
  const [autoOpenUrls,   setAutoOpenUrls]   = useState(settings.autoOpenChatUrls);
  const [showSpeaking,   setShowSpeaking]   = useState(settings.showSpeakingIndicator);

  useEffect(() => { void checkPerms(); }, []);

  // Re-enumerate whenever the permissions tab is opened — labels require a prior getUserMedia call.
  useEffect(() => {
    if (tab === 'permissions') void enumerateDevices();
  }, [tab]);

  async function checkPerms() {
    try {
      const m = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicState(m.state as PermState);
    } catch { setMicState('unknown'); }
    try {
      const c = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setCamState(c.state as PermState);
    } catch { setCamState('unknown'); }
  }

  async function enumerateDevices() {
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      // If labels are empty the user hasn't granted permission yet. Try a silent
      // getUserMedia so the browser populates device labels, then re-enumerate.
      if (devices.every(d => !d.label)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch { /* permission denied — labels stay empty, that's OK */ }
      }
      setMicDevices(devices.filter(d => d.kind === 'audioinput'));
      setCamDevices(devices.filter(d => d.kind === 'videoinput'));
      setSpeakerDevices(devices.filter(d => d.kind === 'audiooutput'));
    } catch { /* ignore */ }
  }

  async function requestPerms() {
    setPermMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(t => t.stop());
      await checkPerms();
      await enumerateDevices();
      setPermMsg('Permissions granted.');
    } catch {
      await checkPerms();
      setPermMsg('Could not get permissions. Check OS privacy settings.');
    }
  }

  function addChannel() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || channels.find(c => c.name === name)) return;
    setChannels(prev => [...prev, { name, displayName: newLabel.trim() || name, emoji: newEmoji || '💬' }]);
    setNewName(''); setNewLabel(''); setNewEmoji('💬');
  }

  function removeChannel(name: string) {
    setChannels(prev => prev.filter(c => c.name !== name));
    if (autoJoin === name) setAutoJoin('');
  }

  function startEditChannel(ch: Channel) {
    setEditingName(ch.name);
    setEditLabel(ch.displayName);
    setEditEmoji(ch.emoji || '💬');
  }

  function saveEditChannel() {
    if (!editingName) return;
    setChannels(prev => prev.map(c =>
      c.name === editingName
        ? { ...c, displayName: editLabel.trim() || c.name, emoji: editEmoji || '💬' }
        : c,
    ));
    setEditingName(null);
  }

  function cancelEditChannel() { setEditingName(null); }

  function save() {
    onSave({ ...settings, displayName: displayName.trim(), avatarEmoji, serverUrl: serverUrl.trim(), channels, autoJoinChannel: autoJoin, preferredMicDeviceId: prefMic, preferredCamDeviceId: prefCam, preferredSpeakerDeviceId: prefSpeaker, autoOpenChatUrls: autoOpenUrls, showSpeakingIndicator: showSpeaking });
    onClose();
  }

  const permColor = (s: PermState) => s === 'granted' ? '#23d18b' : s === 'denied' ? '#ef5350' : 'var(--text-muted)';
  const permLabel = (s: PermState) => s === 'granted' ? '✓ Granted' : s === 'denied' ? '✕ Denied' : '? Unknown';

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">

        <div className="modal-header">
          <span>Settings</span>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }}>✕</button>
        </div>

        <div className="modal-tabs">
          {(['profile', 'channels', 'permissions'] as Tab[]).map(t => (
            <button key={t} className={`modal-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">

          {tab === 'profile' && (
            <>
              <div className="form-field">
                <label>Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name shown to others in calls" />
              </div>
              <div className="form-field">
                <label>Avatar emoji</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <EmojiPicker value={avatarEmoji} onChange={setAvatarEmoji} size="md" />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Shown next to your name in participant lists and call tiles.
                  </span>
                </div>
              </div>
              <div className="form-field">
                <label>Server URL</label>
                <input value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                  placeholder="https://meet.russellpreece.com" />
              </div>
              <label className="checkbox-row" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={autoOpenUrls} onChange={e => setAutoOpenUrls(e.target.checked)} />
                <span>
                  Auto-open links from chat
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    When another participant pastes a URL, open it in your default browser. Your own messages are never auto-opened.
                  </span>
                </span>
              </label>
              <label className="checkbox-row" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={showSpeaking} onChange={e => setShowSpeaking(e.target.checked)} />
                <span>
                  Show speaking indicator
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Draw a green ring around tiles of whoever is currently speaking.
                  </span>
                </span>
              </label>
            </>
          )}

          {tab === 'channels' && (
            <>
              <div className="channel-settings-list">
                {channels.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>No channels. Add one below.</p>
                )}
                {channels.map(ch => {
                  if (editingName === ch.name) {
                    return (
                      <div key={ch.name} className="channel-settings-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <EmojiPicker value={editEmoji} onChange={setEditEmoji} size="sm" />
                        <input
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          placeholder={ch.name}
                          style={{ flex: 1, minWidth: 120 }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditChannel();
                            if (e.key === 'Escape') cancelEditChannel();
                          }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{ch.name}</span>
                        <button className="btn-secondary" onClick={saveEditChannel} style={{ padding: '4px 10px', fontSize: 12 }}>Save</button>
                        <button className="btn-secondary" onClick={cancelEditChannel} style={{ padding: '4px 10px', fontSize: 12 }}>Cancel</button>
                      </div>
                    );
                  }
                  return (
                    <div key={ch.name} className="channel-settings-row">
                      <span className="emoji" style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{ch.emoji}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>
                        {ch.displayName}
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>#{ch.name}</span>
                      </span>
                      <button className="ch-delete" onClick={() => startEditChannel(ch)} title="Edit" style={{ color: 'var(--text-muted)' }}>✏</button>
                      <button className="ch-delete" onClick={() => removeChannel(ch.name)} title="Remove">✕</button>
                    </div>
                  );
                })}
              </div>

              <div className="channel-add-form">
                <div className="form-field">
                  <label>Room name (lowercase, no spaces)</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="my-room" onKeyDown={e => e.key === 'Enter' && addChannel()} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label>Display label</label>
                    <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      placeholder="My Room" onKeyDown={e => e.key === 'Enter' && addChannel()} />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label>Emoji</label>
                    <EmojiPicker value={newEmoji} onChange={setNewEmoji} size="sm" />
                  </div>
                </div>
                <button className="btn-secondary" onClick={addChannel} disabled={!newName.trim()} style={{ marginTop: 12 }}>
                  + Add channel
                </button>
              </div>

              <div className="form-field" style={{ marginTop: 16 }}>
                <label>Auto-join channel on startup</label>
                <select
                  value={autoJoin}
                  onChange={e => setAutoJoin(e.target.value)}
                  style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', width: '100%', fontSize: 13 }}
                >
                  <option value="">None</option>
                  {channels.map(ch => <option key={ch.name} value={ch.name}>{ch.displayName}</option>)}
                </select>
              </div>
            </>
          )}

          {tab === 'permissions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="perm-row">
                <span>Microphone</span>
                <span style={{ color: permColor(micState), fontWeight: 600, fontSize: 13 }}>{permLabel(micState)}</span>
              </div>
              <div className="perm-row">
                <span>Camera</span>
                <span style={{ color: permColor(camState), fontWeight: 600, fontSize: 13 }}>{permLabel(camState)}</span>
              </div>

              <button className="btn-secondary" onClick={requestPerms} style={{ marginTop: 4 }}>
                Request / re-test permissions
              </button>

              {permMsg && (
                <p style={{ fontSize: 13, color: permMsg.startsWith('Could') ? '#ef5350' : '#23d18b' }}>{permMsg}</p>
              )}

              {micDevices.length > 0 && (
                <div className="form-field" style={{ marginTop: 4 }}>
                  <label>Preferred microphone</label>
                  <select
                    value={prefMic}
                    onChange={e => setPrefMic(e.target.value)}
                    style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', width: '100%', fontSize: 13 }}
                  >
                    <option value="">System default</option>
                    {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>)}
                  </select>
                </div>
              )}

              {camDevices.length > 0 && (
                <div className="form-field" style={{ marginTop: 4 }}>
                  <label>Preferred camera</label>
                  <select
                    value={prefCam}
                    onChange={e => setPrefCam(e.target.value)}
                    style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', width: '100%', fontSize: 13 }}
                  >
                    <option value="">System default</option>
                    {camDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>)}
                  </select>
                </div>
              )}

              {speakerDevices.length > 0 && (
                <div className="form-field" style={{ marginTop: 4 }}>
                  <label>Preferred speaker / headphones</label>
                  <select
                    value={prefSpeaker}
                    onChange={e => setPrefSpeaker(e.target.value)}
                    style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', width: '100%', fontSize: 13 }}
                  >
                    <option value="">System default</option>
                    {speakerDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 8)}`}</option>)}
                  </select>
                </div>
              )}

              {(micDevices.length === 0 && camDevices.length === 0) && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Grant permissions above to see available devices.</p>
              )}

              {(micState === 'denied' || camState === 'denied') && (
                <div style={{ background: 'var(--bg-main)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, marginTop: 4 }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>To re-enable access:</strong>
                  <strong style={{ color: 'var(--text-primary)' }}>Windows</strong> — Settings → Privacy &amp; Security → Microphone / Camera → allow PreeceMeet<br />
                  <strong style={{ color: 'var(--text-primary)' }}>macOS</strong> — System Settings → Privacy &amp; Security → Microphone / Camera → enable PreeceMeet<br />
                  <strong style={{ color: 'var(--text-primary)' }}>Linux</strong> — Check your desktop environment's privacy settings
                </div>
              )}
            </div>
          )}

        </div>

        <div className="modal-footer">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>
            PreeceMeet v{pkg.version}
          </span>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ width: 'auto', margin: 0, padding: '8px 24px' }} onClick={save}>Save</button>
        </div>

      </div>
    </div>
  );
}
