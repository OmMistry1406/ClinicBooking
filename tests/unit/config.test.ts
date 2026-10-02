import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/lib/config';

describe('loadConfig', () => {
  it('accepts a valid IANA zone', () => {
    expect(loadConfig({ CLINIC_TZ: 'UTC' }).clinicTz).toBe('UTC');
    expect(loadConfig({ CLINIC_TZ: 'America/New_York' }).clinicTz).toBe('America/New_York');
  });

  it('fails when CLINIC_TZ is missing or empty', () => {
    expect(() => loadConfig({})).toThrow(/CLINIC_TZ/);
    expect(() => loadConfig({ CLINIC_TZ: '' })).toThrow(/CLINIC_TZ/);
  });

  it('fails when CLINIC_TZ is invalid', () => {
    expect(() => loadConfig({ CLINIC_TZ: 'Not/AZone' })).toThrow(/CLINIC_TZ/);
  });

  it('parses holidays and rejects malformed ones', () => {
    expect(loadConfig({ CLINIC_TZ: 'UTC', HOLIDAYS: '2026-12-25, 2027-01-01' }).holidays).toEqual([
      '2026-12-25',
      '2027-01-01',
    ]);
    expect(loadConfig({ CLINIC_TZ: 'UTC' }).holidays).toEqual([]);
    expect(() => loadConfig({ CLINIC_TZ: 'UTC', HOLIDAYS: '25/12/2026' })).toThrow(/HOLIDAYS/);
  });
});
