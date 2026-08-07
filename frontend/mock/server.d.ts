import type { Server } from 'node:http';

export interface MockAppOptions {
  dbPath?: string;
  passwordsPath?: string;
}

export function createMockApp(options?: MockAppOptions): Server;
export function startMockServer(port?: number): Server;
