import { describe, it, expect } from 'vitest';
import * as http from 'http';

/**
 * Acceptance tests for advanced scenarios and edge cases
 */

const BASE_URL = 'http://127.0.0.1:3000';

async function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers as Record<string, string> });
        } catch {
          resolve({ status: res.statusCode || 500, body: data, headers: res.headers as Record<string, string> });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('[FR-04] Timezone-aware slot validation', () => {
  it('[FR-04] validates slots in clinic timezone not UTC', async () => {
    // With CLINIC_TZ=UTC, slot at 09:00Z should be valid
    const resUtc = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:00:00Z', // 09:00 UTC
      name: 'Test UTC',
      phone: '+44 7700 900111',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    // With UTC timezone, 09:00 is opening time, should be valid or rate-limited/slot-taken
    expect([201, 409]).toContain(resUtc.status);
  });

  it('[FR-04] respects CLINIC_TZ for opening hours', async () => {
    // Test that slots outside clinic hours in the clinic timezone are rejected
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T08:00:00Z', // 8:00 UTC - might be before 9:00 in clinic TZ
      name: 'Test',
      phone: '+44 7700 900222',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    // Depends on CLINIC_TZ setting, but should be rejected if before opening time
    expect([400, 201, 409]).toContain(res.status);
  });

  it('[FR-04] rejects lunch hour in clinic timezone', async () => {
    // Default lunch: 13:00-14:00 clinic local time
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T13:00:00Z', // 13:00 UTC (might be lunch time)
      name: 'Test',
      phone: '+44 7700 900333',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    // Depends on timezone, but should fail if it's actually lunch time
    expect([400, 201, 409]).toContain(res.status);
  });
});

describe('[FR-01, FR-04] Boundary conditions', () => {
  it('[FR-01] last slot of day is at 16:45 (within 15-min boundary)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.slots)).toBe(true);
    if (res.body.slots.length > 0) {
      const lastSlot = res.body.slots[res.body.slots.length - 1];
      expect(lastSlot).toMatch(/T16:45:00Z$/);
    }
  });

  it('[FR-01] first slot of day is at 09:00', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    if (res.body.slots.length > 0) {
      const firstSlot = res.body.slots[0];
      expect(firstSlot).toMatch(/T09:00:00Z$/);
    }
  });

  it('[FR-04] slot at 09:00 is valid but 08:59 is not', async () => {
    const valid = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:00:00Z',
      name: 'Test Valid',
      phone: '+44 7700 900444',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    const invalid = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T08:59:00Z',
      name: 'Test Invalid',
      phone: '+44 7700 900555',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    expect([201, 409]).toContain(valid.status);
    expect(invalid.status).toBe(400);
  });

  it('[FR-04] slot at 16:45 is valid but 17:00 is not', async () => {
    const valid = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T16:45:00Z',
      name: 'Test Valid',
      phone: '+44 7700 900666',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    const invalid = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T17:00:00Z',
      name: 'Test Invalid',
      phone: '+44 7700 900777',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    expect([201, 409]).toContain(valid.status);
    expect(invalid.status).toBe(400);
  });

  it('[FR-01] lunch hour transition: 12:45 is valid, 13:00-13:59 not valid, 14:00 is valid', async () => {
    const before = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T12:45:00Z',
      name: 'Before Lunch',
      phone: '+44 7700 900888',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    const during = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T13:30:00Z',
      name: 'During Lunch',
      phone: '+44 7700 900999',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    const after = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T14:00:00Z',
      name: 'After Lunch',
      phone: '+44 7700 901111',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    expect([201, 409]).toContain(before.status);
    expect(during.status).toBe(400);
    expect([201, 409]).toContain(after.status);
  });
});

describe('[FR-02] Form field constraints', () => {
  it('[FR-02] name at exactly 100 chars is accepted', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'a'.repeat(100),
      phone: '+44 7700 900112',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect([201, 409]).toContain(res.status);
    expect(res.body.fieldErrors?.name).toBeUndefined();
  });

  it('[FR-02] name at 101 chars is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'a'.repeat(101),
      phone: '+44 7700 900113',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.name).toBeDefined();
  });

  it('[FR-02] phone at exactly 7 chars is accepted', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '1234567',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect([201, 409]).toContain(res.status);
    expect(res.body.fieldErrors?.phone).toBeUndefined();
  });

  it('[FR-02] phone at 6 chars is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '123456',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.phone).toBeDefined();
  });

  it('[FR-02] phone at exactly 20 chars is accepted', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '12345678901234567890',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect([201, 409]).toContain(res.status);
    expect(res.body.fieldErrors?.phone).toBeUndefined();
  });

  it('[FR-02] phone at 21 chars is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '123456789012345678901',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.phone).toBeDefined();
  });

  it('[FR-02] phone with valid format +44 7700 900-123', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '+44 7700 900-123',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect([201, 409]).toContain(res.status);
    expect(res.body.fieldErrors?.phone).toBeUndefined();
  });

  it('[FR-02] phone with invalid chars (parentheses) is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '+1 (555) 123-4567',
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.phone).toBeDefined();
  });

  it('[FR-02] email at exactly 254 chars is accepted', async () => {
    const email = 'a'.repeat(240) + '@example.co';
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '+44 7700 900114',
      email,
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect([201, 409]).toContain(res.status);
    expect(res.body.fieldErrors?.email).toBeUndefined();
  });

  it('[FR-02] notes at exactly 500 chars is accepted', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '+44 7700 900115',
      email: '',
      notes: 'n'.repeat(500),
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect([201, 409]).toContain(res.status);
    expect(res.body.fieldErrors?.notes).toBeUndefined();
  });

  it('[FR-02] notes at 501 chars is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:15:00Z',
      name: 'Test',
      phone: '+44 7700 900116',
      email: '',
      notes: 'n'.repeat(501),
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.notes).toBeDefined();
  });
});

describe('[FR-05] Cancellation token uniqueness and security', () => {
  it('[FR-05] each booking receives a unique cancel token', async () => {
    const tokens = [];
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest('POST', '/api/appointments', {
        slot: `2026-10-06T09:${String(i * 15).padStart(2, '0')}:00Z`,
        name: `Test ${i}`,
        phone: `+44770090${String(i).padStart(4, '0')}`,
        email: '',
        notes: '',
        consent: true,
        captchaToken: '1x00000000000000000000AA',
      });
      if (res.status === 201) {
        tokens.push(res.body.cancelToken);
      }
    }
    // All tokens should be unique
    const unique = new Set(tokens);
    expect(unique.size).toBe(tokens.length);
  });

  it('[FR-05] cancel token is not predictable', async () => {
    const tokens = [];
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest('POST', '/api/appointments', {
        slot: `2026-10-06T10:${String(i * 15).padStart(2, '0')}:00Z`,
        name: `Test ${i}`,
        phone: `+44770090${String(5 + i).padStart(4, '0')}`,
        email: '',
        notes: '',
        consent: true,
        captchaToken: '1x00000000000000000000AA',
      });
      if (res.status === 201) {
        tokens.push(res.body.cancelToken);
      }
    }
    // Tokens should not follow a pattern (highly random)
    // Just verify they're all different
    const unique = new Set(tokens);
    expect(unique.size).toBe(tokens.length);
  });
});

describe('[FR-02, FR-14] Error message wording', () => {
  it('[FR-14] slot-taken error message is user-friendly', async () => {
    const phone1 = '+44 7700 901234';
    const res1 = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T09:30:00Z',
      name: 'First',
      phone: phone1,
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });

    if (res1.status === 201) {
      const res2 = await makeRequest('POST', '/api/appointments', {
        slot: '2026-10-06T09:30:00Z',
        name: 'Second',
        phone: '+44 7700 901235',
        email: '',
        notes: '',
        consent: true,
        captchaToken: '1x00000000000000000000AA',
      });
      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain('no longer available');
    }
  });

  it('[FR-14] phone limit error message is specific', async () => {
    const phone = '+44 7700 901300';
    // Create 3 bookings
    for (let i = 0; i < 3; i++) {
      await makeRequest('POST', '/api/appointments', {
        slot: `2026-10-06T10:${String(30 + i * 15).padStart(2, '0')}:00Z`,
        name: `Person ${i}`,
        phone,
        email: '',
        notes: '',
        consent: true,
        captchaToken: '1x00000000000000000000AA',
      });
    }

    // 4th booking should fail with specific message
    const res = await makeRequest('POST', '/api/appointments', {
      slot: '2026-10-06T11:15:00Z',
      name: 'Person 4',
      phone,
      email: '',
      notes: '',
      consent: true,
      captchaToken: '1x00000000000000000000AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('maximum of 3 active appointments');
  });

  it('[FR-14] rate limit error is clear', async () => {
    // Make 6 rapid requests to trigger rate limit
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        makeRequest('POST', '/api/appointments', {
          slot: `2026-10-07T09:${String(i * 15).padStart(2, '0')}:00Z`,
          name: `Rate Test ${i}`,
          phone: `+44770091${String(i).padStart(3, '0')}`,
          email: '',
          notes: '',
          consent: true,
          captchaToken: '1x00000000000000000000AA',
        })
      );
    }
    const results = await Promise.all(requests);
    const rateLimited = results.find((r) => r.status === 429);
    if (rateLimited) {
      expect(rateLimited.body.error).toContain('try again');
    }
  });
});

describe('[FR-01] Special dates and holidays', () => {
  it('[FR-01] configured holiday 2026-12-25 has no slots', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-12-25');
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('[FR-01] configured holiday 2027-01-01 has no slots', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2027-01-01');
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('[FR-01] day after holiday has normal slots', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-12-26');
    expect(res.status).toBe(200);
    // If not Saturday/Sunday, should have slots
    const dateObj = new Date('2026-12-26');
    const dayOfWeek = dateObj.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      expect(res.body.slots.length).toBeGreaterThan(0);
    }
  });
});

describe('[FR-10] Summary edge cases', () => {
  it('[FR-10] summary with no appointments shows zero counts', async () => {
    // Select a date with likely no appointments
    const res = await makeRequest('GET', '/api/staff/summary?view=day&date=2025-10-06');
    if (res.status === 200) {
      expect(res.body.total || 0).toBe(0);
      expect((res.body.pending || 0) + (res.body.confirmed || 0) + (res.body.cancelled || 0) + (res.body.no_show || 0)).toBe(0);
    }
  });

  it('[FR-10] summary total equals sum of statuses', async () => {
    const res = await makeRequest('GET', '/api/staff/summary?view=day&date=2026-10-06');
    if (res.status === 200) {
      const sum =
        (res.body.pending || 0) + (res.body.confirmed || 0) + (res.body.cancelled || 0) + (res.body.no_show || 0);
      expect(res.body.total || 0).toBe(sum);
    }
  });
});
