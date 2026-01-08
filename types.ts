
export enum DoorStatus {
  OPEN = 'ABIERTA',
  CLOSED = 'CERRADA',
  OPENING = 'ABRIENDO',
  CLOSING = 'CERRANDO',
  STOPPED = 'DETENIDA'
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
  active: boolean;
  startDate?: string;
  endDate?: string;
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

export interface ChargeSchedule {
  startHour: number;
  endHour: number;
  enabled: boolean;
}
