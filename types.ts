
export enum DoorStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  OPENING = 'OPENING',
  CLOSING = 'CLOSING'
}

export enum UserType {
  PERMANENT = 'PERMANENT',
  TEMPORARY = 'TEMPORARY',
  BLACKLISTED = 'BLACKLISTED'
}

export interface AccessUser {
  id: string;
  name: string;
  phone: string;
  plate: string;
  type: UserType;
  startDate?: string;
  endDate?: string;
  active: boolean;
}

export interface AccessLog {
  id: string;
  timestamp: string;
  userName: string;
  plate: string;
  action: 'ENTRY' | 'EXIT' | 'DENIED';
  method: 'LPR' | 'MANUAL' | 'BLUETOOTH' | 'ADMIN';
  reason?: string;
}

export interface HardwareStatus {
  esp32_connected: boolean;
  camera_status: 'ONLINE' | 'OFFLINE';
  reed_switch: 'TRIGGERED' | 'IDLE'; // Reed switch for open/close detection
  relay_state: boolean;
  signal_strength: number;
}
