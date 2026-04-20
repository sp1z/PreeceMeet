export interface Channel {
  name: string;
  displayName: string;
  emoji: string;
}

export interface Settings {
  serverUrl: string;
  savedEmail: string;
  displayName: string;
  /** Emoji shown as the user's avatar in participant lists + tile overlays. */
  avatarEmoji: string;
  rememberMe: boolean;
  channels: Channel[];
  autoJoinChannel: string;
  sidebarVisible: boolean;
  preferredMicDeviceId: string;
  preferredCamDeviceId: string;
  preferredSpeakerDeviceId: string;
  sidebarWidth?: number;
  autoOpenChatUrls: boolean;
  showSpeakingIndicator: boolean;
}

/** Shape of the participant metadata JSON we publish via LiveKit. */
export interface ParticipantMeta {
  avatarEmoji?: string;
}

export interface ChatMessage {
  id:        string;
  from:      string;       // participant identity (email)
  fromName:  string;       // friendly display name
  text:      string;
  timestamp: number;
  isLocal:   boolean;
}

export interface Session {
  email: string;
  sessionToken: string;
  serverUrl: string;
  isAdmin: boolean;
}

export interface ParticipantSummary {
  identity:    string;
  name:        string;
  avatarEmoji: string | null;
}

export interface RoomInfo {
  name: string;
  numParticipants: number;
  /** @deprecated kept for older clients; use `participants` when present. */
  participantNames: string[];
  participants?: ParticipantSummary[];
}

export interface RoomConnection {
  /** Unique key — changing it forces LiveKitRoom to remount and reconnect. */
  key: string;
  url: string;
  token: string;
  roomName: string;
}

export type AppPage = 'login' | 'totp' | 'main';

export interface TotpState {
  tempToken: string;
  /** Present on first-time TOTP setup */
  otpUri?: string;
  totpSecret?: string;
}
