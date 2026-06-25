import { vi } from 'vitest';

// Minimal chrome.* mock for unit tests. Only the methods actually used by the
// code under test are stubbed — extend as needed when new surface is exercised.
const storage: Record<string, any> = {};

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((k?: string | string[] | null) => {
        if (typeof k === 'string') return Promise.resolve({ [k]: storage[k] });
        return Promise.resolve({ ...storage });
      }),
      set: vi.fn((obj: Record<string, any>) => { Object.assign(storage, obj); return Promise.resolve(); }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn(() => Promise.resolve({ success: true })),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    id: 'test-extension-id',
  },
  alarms: { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn() } },
  notifications: { create: vi.fn(), clear: vi.fn() },
  offscreen: { hasDocument: vi.fn(() => false), createDocument: vi.fn(() => Promise.resolve()) },
  downloads: { download: vi.fn(), removeFile: vi.fn(), erase: vi.fn(), onChanged: { addListener: vi.fn() } },
} as any;
