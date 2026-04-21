import type { StyleProp, ViewStyle } from 'react-native';

export type GuardianSmsRecord = {
  id: string;
  address: string;
  body: string;
  date: number;
  type: string;
  read: boolean;
};

export type GuardianImageRecord = {
  id: string;
  uri: string;
  filename: string;
  mediaType: 'photo' | 'video' | 'unknown';
  creationTime: number;
  width?: number;
  height?: number;
  albumId?: string;
};

export type GuardianScanProgress = {
  stage: 'idle' | 'running' | 'completed' | 'error';
  source: 'sms' | 'media' | 'watcher';
  scanned: number;
  total?: number;
  cursor?: string;
  message?: string;
};

export type GuardianPermissionState = {
  smsGranted: boolean;
  mediaGranted: boolean;
  notificationsGranted: boolean;
  batteryOptimizationIgnored: boolean;
};

export type GuardianBootstrapState = {
  canAutoMonitor: boolean;
  permissionState: GuardianPermissionState;
  smsSupported: boolean;
  mediaSupported: boolean;
  nativeWatcherSupported: boolean;
};

export type StartMediaScanOptions = {
  pageSize?: number;
  album?: string;
  after?: string;
  includeVideos?: boolean;
};

export type StartSmsScanOptions = {
  limit?: number;
  since?: number;
};

export type GuardianSmsEventPayload = {
  record: GuardianSmsRecord;
};

export type GuardianMediaEventPayload = {
  record: GuardianImageRecord;
};

export type GuardianProgressEventPayload = {
  progress: GuardianScanProgress;
};

export type ChangeEventPayload = {
  value: string;
};

export type OnLoadEventPayload = {
  url: string;
};

export type A30GuardianModuleEvents = {
  onSmsReceived: (params: GuardianSmsEventPayload) => void;
  onMediaDiscovered: (params: GuardianMediaEventPayload) => void;
  onScanProgress: (params: GuardianProgressEventPayload) => void;
};

export type A30GuardianViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
