export interface Channel {
  name: string;
  displayName: string;
  emoji: string;
}

export interface Settings {
  serverUrl: string;
  savedEmail: string;
  displayName: string;
  rememberMe: boolean;
  channels: Channel[];
  autoJoinChannel: string;
  sidebarVisible: boolean;
  preferredMicDeviceId: string;
  preferredCamDeviceId: string;
  preferredSpeakerDeviceId: string;
  sidebarWidth?: number;
}

export interface Session {
  email: string;
  sessionToken: string;
  serverUrl: string;
  isAdmin: boolean;
}

export interface RoomInfo {
  name: string;
  numParticipants: number;
  participantNames: string[];
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
