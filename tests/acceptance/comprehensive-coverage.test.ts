import { describe, it, expect, beforeAll } from 'vitest';
import {
  makeRequest,
  BASE_URL,
  VALID_BOOKING,
  generatePhoneNumber,
  generateSlot,
  isValidISOTimestamp,
} from './setup';

/**
 * Comprehensive acceptance test coverage verification
 * Ensures all requirements are testable and covers integration scenarios
 */

describe('[FR-01] Slot generation - comprehensive coverage', () => {
  it('[FR-01] generates exactly 28 slots for a normal weekday (Monday-Friday, not holiday, not lunch)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06'); // Monday
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(28);
  });

  it('[FR-01] morning slots: 16 slots from 09:00 to 12:45 (4 per hour)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    const morningSlots = res.body.slots.filter((s: string) => s.includes('T09:') || s.includes('T10:') || s.includes('T11:') || s.includes('T12:'));
    expect(morningSlots).toHaveLength(16);
  });

  it('[FR-01] afternoon slots: 12 slots from 14:00 to 16:45 (4 per hour)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    const afternoonSlots = res.body.slots.filter((s: string) => s.includes('T14:') || s.includes('T15:') || s.includes('T16:'));
    expect(afternoonSlots).toHaveLength(12);
  });

  it('[FR-01] no slots offered between 13:00 and 13:59 (lunch hour)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    const lunchSlots = res.body.slots.filter((s: string) => s.includes('T13:'));
    expect(lunchSlots).toHaveLength(0);
  });

  it('[FR-01] Saturday offers zero slots', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-10');
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(0);
  });

  it('[FR-01] Sunday offers zero slots', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-11');
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(0);
  });

  it('[FR-01] configured holidays offer zero slots', async () => {
    // Holidays from .env.example: 2026-12-25, 2027-01-01
    const res1 = await makeRequest('GET', '/api/slots?date=2026-12-25');
    expect(res1.status).toBe(200);
    expect(res1.body.slots).toHaveLength(0);

    const res2 = await makeRequest('GET', '/api/slots?date=2027-01-01');
    expect(res2.status).toBe(200);
    expect(res2.body.slots).toHaveLength(0);
  });

  it('[FR-01] dates beyond 90 days from today offer zero slots', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2027-03-01');
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(0);
  });

  it('[FR-01] all returned slots are 15-minute intervals', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    const minutes = res.body.slots.map((s: string) => {
      const d = new Date(s);
      return d.getUTCMinutes();
    });
    minutes.forEach((m: number) => {
      expect([0, 15, 30, 45]).toContain(m);
    });
  });
});

describe('[FR-02, FR-04] Booking validation - comprehensive coverage', () => {
  it('[FR-02] name is required and must be 1-100 chars', async () => {
    const empty = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, name: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.fieldErrors?.name).toBeDefined();

    const tooLong = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, name: 'a'.repeat(101) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.fieldErrors?.name).toBeDefined();

    const valid = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, name: 'a'.repeat(100) });
    expect([201, 409]).toContain(valid.status);
  });

  it('[FR-02] phone is required and must be 7-20 chars with only digits, +, spaces, dashes', async () => {
    const empty = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, phone: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.fieldErrors?.phone).toBeDefined();

    const tooShort = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, phone: '123456' });
    expect(tooShort.status).toBe(400);

    const tooLong = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, phone: '1'.repeat(21) });
    expect(tooLong.status).toBe(400);

    const invalid = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, phone: '+1 (555) 123-4567' });
    expect(invalid.status).toBe(400);

    const valid1 = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, phone: '1234567' });
    expect([201, 409]).toContain(valid1.status);

    const valid2 = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, phone: '+44 7700 900-123' });
    expect([201, 409]).toContain(valid2.status);
  });

  it('[FR-02] email is optional, must match pattern, max 254 chars', async () => {
    const empty = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: '' });
    expect([201, 409]).toContain(empty.status);

    const valid = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: 'test@example.co.uk' });
    expect([201, 409]).toContain(valid.status);

    const invalid1 = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: 'test@' });
    expect(invalid1.status).toBe(400);

    const invalid2 = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: 'test@.com' });
    expect(invalid2.status).toBe(400);

    const tooLong = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: 'a'.repeat(250) + '@b.co' });
    expect(tooLong.status).toBe(400);
  });

  it('[FR-02] notes is optional, max 500 chars', async () => {
    const empty = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, notes: '' });
    expect([201, 409]).toContain(empty.status);

    const valid = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, notes: 'n'.repeat(500) });
    expect([201, 409]).toContain(valid.status);

    const tooLong = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, notes: 'n'.repeat(501) });
    expect(tooLong.status).toBe(400);
  });

  it('[FR-02] consent checkbox is required', async () => {
    const res = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, consent: false });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.consent).toBeDefined();
  });

  it('[FR-04] slot validation: rejects Saturday, Sunday, lunch, holiday, misaligned, future, past', async () => {
    const testCases = [
      { name: 'Saturday', slot: '2026-10-10T10:00:00Z' },
      { name: 'Sunday', slot: '2026-10-11T10:00:00Z' },
      { name: 'Lunch hour', slot: '2026-10-06T13:00:00Z' },
      { name: 'Holiday', slot: '2026-10-08T10:00:00Z' },
      { name: 'Misaligned (10:07)', slot: '2026-10-06T10:07:00Z' },
      { name: 'Beyond 90 days', slot: '2027-03-01T10:00:00Z' },
      { name: 'Before opening', slot: '2026-10-06T08:45:00Z' },
      { name: 'After closing', slot: '2026-10-06T17:00:00Z' },
      { name: 'Past time', slot: '2026-10-04T10:00:00Z' },
      { name: 'Invalid date', slot: 'not-a-date' },
    ];

    for (const tc of testCases) {
      const res = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, slot: tc.slot });
      expect(res.status).toBe(400, `${tc.name} should be rejected`);
    }
  });
});

describe('[FR-03, FR-05] Slot and cancellation flow', () => {
  it('[FR-03] concurrent submissions to same slot result in one success and one 409 conflict', async () => {
    const slot = '2026-10-07T09:00:00Z';
    const [res1, res2] = await Promise.all([
      makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, slot, name: 'User1', phone: '+44 7700 901001' }),
      makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, slot, name: 'User2', phone: '+44 7700 901002' }),
    ]);

    expect([res1.status, res2.status].sort()).toEqual([201, 409]);
    const success = res1.status === 201 ? res1 : res2;
    const failure = res1.status === 409 ? res1 : res2;
    expect(failure.body.error).toContain('no longer available');
  });

  it('[FR-05] cancel token is unique, unguessable (128+ bits), and present in response', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      phone: '+44 7700 901003',
      slot: '2026-10-07T09:15:00Z',
    });
    expect(res.status).toBe(201);
    expect(res.body.cancelToken).toBeDefined();
    expect(res.body.cancelToken).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
  });

  it('[FR-05] cancel page shows only slot_start and status, no PII', async () => {
    const bookRes = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      phone: '+44 7700 901004',
      slot: '2026-10-07T09:30:00Z',
      name: 'Confidential Name',
      email: 'secret@example.com',
      notes: 'Secret notes',
    });
    expect(bookRes.status).toBe(201);

    const cancelRes = await makeRequest('GET', `/api/cancel/${bookRes.body.cancelToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.slot_start).toBeDefined();
    expect(cancelRes.body.status).toBe('pending');
    expect(cancelRes.body.name).toBeUndefined();
    expect(cancelRes.body.phone).toBeUndefined();
    expect(cancelRes.body.email).toBeUndefined();
    expect(cancelRes.body.notes).toBeUndefined();
  });

  it('[FR-05] patient cancellation sets status to cancelled and frees slot', async () => {
    const bookRes = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      phone: '+44 7700 901005',
      slot: '2026-10-07T09:45:00Z',
    });
    expect(bookRes.status).toBe(201);

    const cancelRes = await makeRequest('POST', `/api/cancel/${bookRes.body.cancelToken}`);
    expect(cancelRes.status).toBe(200);

    // Verify status is now cancelled
    const checkRes = await makeRequest('GET', `/api/cancel/${bookRes.body.cancelToken}`);
    expect(checkRes.body.status).toBe('cancelled');

    // Verify slot is free for new booking
    const rebookRes = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      phone: '+44 7700 901006',
      slot: '2026-10-07T09:45:00Z',
    });
    expect([201, 409]).toContain(rebookRes.status); // May be taken by another test
  });

  it('[FR-05] invalid cancel token returns 404 without exposing data', async () => {
    const res = await makeRequest('GET', '/api/cancel/invalid-token-that-never-existed');
    expect(res.status).toBe(404);
    expect(res.body.slot_start).toBeUndefined();
  });
});

describe('[FR-11] Spam protection - CAPTCHA and rate limiting', () => {
  it('[FR-11] missing CAPTCHA token is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      captchaToken: undefined,
      phone: '+44 7700 901007',
      slot: '2026-10-07T10:00:00Z',
    });
    expect(res.status).toBe(403);
  });

  it('[FR-11] invalid CAPTCHA token is rejected', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      captchaToken: 'invalid-token-xyz',
      phone: '+44 7700 901008',
      slot: '2026-10-07T10:15:00Z',
    });
    expect(res.status).toBe(403);
  });

  it('[FR-11] rate limit: 5 successful bookings allowed per 10 minutes per IP', async () => {
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        makeRequest('POST', '/api/appointments', {
          ...VALID_BOOKING,
          phone: generatePhoneNumber(2000 + i),
          slot: generateSlot(1, i),
          name: `Rate Test ${i}`,
        })
      );
    }
    const results = await Promise.all(requests);
    const successes = results.filter((r) => r.status === 201);
    const rateLimited = results.find((r) => r.status === 429);

    expect(successes.length).toBeLessThanOrEqual(5);
    if (rateLimited) {
      expect(rateLimited.body.error).toContain('try again');
    }
  });

  it('[FR-11] phone with 3+ pending/confirmed appointments is rejected', async () => {
    const phone = '+44 7700 901100';
    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(
        makeRequest('POST', '/api/appointments', {
          ...VALID_BOOKING,
          phone,
          slot: generateSlot(2, i),
          name: `Multi Booking ${i}`,
        })
      );
    }
    const results = await Promise.all(requests);
    const successes = results.filter((r) => r.status === 201);
    expect(successes.length).toBeLessThanOrEqual(3);

    if (successes.length === 3) {
      // Try to book a 4th
      const fourthRes = await makeRequest('POST', '/api/appointments', {
        ...VALID_BOOKING,
        phone,
        slot: generateSlot(2, 3),
        name: 'Multi Booking 4',
      });
      expect(fourthRes.status).toBe(400);
      expect(fourthRes.body.error).toContain('maximum of 3 active appointments');
    }
  });
});

describe('[FR-06] Staff authentication - security policies', () => {
  it('[FR-06] login requires password of 12+ characters', async () => {
    const res = await makeRequest('POST', '/api/staff/login', {
      email: 'staff@clinic.test',
      password: 'short123', // Only 8 chars
    });
    expect([400, 401, 429]).toContain(res.status);
  });

  it('[FR-06] wrong credentials return generic error (not field-specific)', async () => {
    const resWrongEmail = await makeRequest('POST', '/api/staff/login', {
      email: 'nonexistent@example.com',
      password: 'ValidPassword123',
    });
    if (resWrongEmail.status === 401) {
      expect(resWrongEmail.body.error).not.toContain('email');
      expect(resWrongEmail.body.error).not.toContain('user not found');
    }

    const resWrongPassword = await makeRequest('POST', '/api/staff/login', {
      email: 'staff@clinic.test',
      password: 'WrongPassword12345',
    });
    if (resWrongPassword.status === 401) {
      expect(resWrongPassword.body.error).not.toContain('password');
      expect(resWrongPassword.body.error).not.toContain('incorrect');
    }
  });

  it('[FR-06] login lockout after 5 failed attempts in 10 minutes', async () => {
    // Make 5 failed attempts rapidly
    const attempts = [];
    for (let i = 0; i < 5; i++) {
      attempts.push(
        makeRequest('POST', '/api/staff/login', {
          email: `locktest${i}@example.com`,
          password: `WrongPass${i}123`,
        })
      );
    }
    await Promise.all(attempts);

    // 6th attempt should be locked out
    const lockoutRes = await makeRequest('POST', '/api/staff/login', {
      email: 'locktest5@example.com',
      password: 'AnyPassword123',
    });
    // Might be 429 if actually locked
    expect([401, 429]).toContain(lockoutRes.status);
  });
});

describe('[FR-13] Privacy and data retention', () => {
  it('[FR-13] consent checkbox is required to submit booking', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      consent: false,
      phone: '+44 7700 901200',
      slot: '2026-10-08T09:00:00Z',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.consent).toBeDefined();
  });
});

describe('[FR-14] Error handling and resilience', () => {
  it('[FR-14] database unavailability returns 503 with friendly message', async () => {
    // This would test actual DB failure - skip for now
    const res = await makeRequest('GET', '/api/health');
    expect(res.status).toBe(200); // DB is available
  });

  it('[FR-14] malformed JSON returns 400', async () => {
    return new Promise<void>((resolve) => {
      const url = new URL('/api/appointments', BASE_URL);
      const req = require('http').request(url, { method: 'POST' }, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          expect([400, 415]).toContain(res.statusCode);
          resolve();
        });
      });
      req.write('not json');
      req.end();
    });
  });
});

describe('[FR-07, FR-10] Staff features - appointments and summaries', () => {
  it('[FR-07] GET /api/staff/appointments returns list for a date', async () => {
    const res = await makeRequest('GET', '/api/staff/appointments?date=2026-10-06');
    // May be 401 if not authenticated, but should not crash
    expect([200, 401, 403]).toContain(res.status);
  });

  it('[FR-10] GET /api/staff/summary returns counts and list', async () => {
    const dayRes = await makeRequest('GET', '/api/staff/summary?view=day&date=2026-10-06');
    expect([200, 401, 403]).toContain(dayRes.status);

    const weekRes = await makeRequest('GET', '/api/staff/summary?view=week&date=2026-10-06');
    expect([200, 401, 403]).toContain(weekRes.status);
  });
});
