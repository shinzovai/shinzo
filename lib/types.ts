export type Role = 'admin' | 'editor';
export type ConfigKey = 'registration' | 'file' | 'date' | 'logo';
export type Slot = { x: number; y: number; width: number; height: number; fontSize: number };
export type TemplateConfig = Record<ConfigKey, Slot>;

// Calibrated against the bundled JPG in A4 contain-fit coordinates.
// x/y represent the element center; width/height are percentages of A4.
export const DEFAULT_CONFIG: TemplateConfig = {
  registration: { x: 31.4, y: 81.0, width: 13.0, height: 2.2, fontSize: 11 },
  file:         { x: 28.7, y: 84.25, width: 9.0, height: 2.2, fontSize: 11 },
  date:         { x: 84.8, y: 81.0, width: 15.0, height: 2.3, fontSize: 11 },
  logo:         { x: 50.0, y: 64.9, width: 26.0, height: 19.7, fontSize: 12 }
};


export type UserPublic = {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  quota: number;
  used: number;
  expiresAt: string | null;
  createdAt: string;
  deviceLimit: number;
  blockedReason: string | null;
};

export function safeConfig(input: unknown): TemplateConfig {
  if (!input || typeof input !== 'object') return structuredClone(DEFAULT_CONFIG);
  const obj = input as Record<string, unknown>;
  const res = structuredClone(DEFAULT_CONFIG);
  for (const k of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
    const raw = obj[k]; if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    for (const p of ['x', 'y', 'width', 'height', 'fontSize'] as const) {
      const num = Number(v[p]);
      if (Number.isFinite(num)) {
        const min = p === 'fontSize' ? 7 : 0;
        const max = p === 'fontSize' ? 32 : 100;
        res[k][p] = Math.min(max, Math.max(min, num));
      }
    }
  }
  return res;
}
