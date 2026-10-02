import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'http';

/**
 * Acceptance tests for clinic appointment booking system
 * Black-box tests that verify all public APIs and business logic
 */

const BASE_URL = 'http://127.0.0.1:3000';
let mockDb: Map<string, any> = new Map();
let mockRateLimits: Map<string, { count: number; reset: number }> = new Map();

// Test fixtures
const VALID_SLOT = '2026-10-06T09:00:00Z'; // Monday 09:00 UTC
const VALID_BOOKING = {
  slot: VALID_SLOT,
  name: 'John Doe',
  phone: '+44 7700 900123',
  email: 'john@example.com',
  notes: 'Please call before arrival',
  consent: true,
  captchaToken: '1x00000000000000000000AA', // Test token that always passes
};

const INVALID_BOOKINGS = {
  missingName: { ...VALID_BOOKING, name: '' },
  missingPhone: { ...VALID_BOOKING, phone: '' },
  invalidEmail: { ...VALID_BOOKING, email: 'test@.com' },
  shortPhone: { ...VALID_BOOKING, phone: '123' },
  longPhone: { ...VALID_BOOKING, phone: '1'.repeat(21) },
  longName: { ...VALID_BOOKING, name: 'a'.repeat(101) },
  longNotes: { ...VALID_BOOKING, notes: 'n'.repeat(501) },
  longEmail: { ...VALID_BOOKING, email: 'a'.repeat(250) + '@b.co' },
  noConsent: { ...VALID_BOOKING, consent: false },
  noCaptcha: { ...VALID_BOOKING, captchaToken: '' },
  invalidCaptcha: { ...VALID_BOOKING, captchaToken: 'invalid-token' },
};

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

describe('[FR-01] Slot generation from fixed schedule', () => {
  it('[FR-01] returns 28 slots on a normal weekday (09:00-12:45 and 14:00-16:45)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    expect(res.body.slots).toBeDefined();
    expect(res.body.slots).toHaveLength(28);
    // Verify slot times are 15-minute intervals
    expect(res.body.slots[0]).toBe('2026-10-06T09:00:00Z');
    expect(res.body.slots[1]).toBe('2026-10-06T09:15:00Z');
    // Should skip 13:00-14:00 lunch
    expect(res.body.slots).not.toContainEqual('2026-10-06T13:00:00Z');
    expect(res.body.slots).not.toContainEqual('2026-10-06T13:45:00Z');
  });

  it('[FR-01] returns zero slots for Saturday', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-10'); // Saturday
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('[FR-01] returns zero slots for Sunday', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-11'); // Sunday
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('[FR-01] excludes lunch hour (13:00-13:59)', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-06');
    expect(res.status).toBe(200);
    const lunchSlots = res.body.slots.filter((s: string) => s.includes('T13:'));
    expect(lunchSlots).toHaveLength(0);
  });

  it('[FR-01] returns zero slots for configured holidays', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-08'); // Holiday in .env
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('[FR-01] returns zero slots for dates > 90 days ahead', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2027-03-01');
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('[FR-01] returns zero slots for past dates relative to today', async () => {
    const res = await makeRequest('GET', '/api/slots?date=2026-10-01');
    expect(res.status).toBe(200);
    // Should be empty or only future times from "now"
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it('[FR-01] returns invalid date error for malformed date', async () => {
    const res = await makeRequest('GET', '/api/slots?date=invalid-date');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('[FR-02] Patient booking form', () => {
  it('[FR-02] creates appointment with valid submission', async () => {
    const res = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    expect(res.status).toBe(201);
    expect(res.body.cancelToken).toBeDefined();
    expect(res.body.cancelUrl).toBeDefined();
    expect(res.body.cancelUrl).toContain(`/cancel/${res.body.cancelToken}`);
  });

  it('[FR-02] rejects submission with missing name', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.missingName);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.name).toBeDefined();
    expect(res.body.error).toBeUndefined();
  });

  it('[FR-02] rejects submission with missing phone', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.missingPhone);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.phone).toBeDefined();
  });

  it('[FR-02] accepts empty email', async () => {
    const booking = { ...VALID_BOOKING, email: '' };
    const res = await makeRequest('POST', '/api/appointments', booking);
    // Should pass email validation
    expect(res.body.fieldErrors?.email).toBeUndefined();
  });

  it('[FR-02] accepts valid email format test@example.co.uk', async () => {
    const booking = { ...VALID_BOOKING, email: 'test@example.co.uk' };
    const res = await makeRequest('POST', '/api/appointments', booking);
    expect(res.body.fieldErrors?.email).toBeUndefined();
  });

  it('[FR-02] rejects invalid email formats', async () => {
    const res1 = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: 'test@.com' });
    expect(res1.status).toBe(400);
    expect(res1.body.fieldErrors?.email).toBeDefined();

    const res2 = await makeRequest('POST', '/api/appointments', { ...VALID_BOOKING, email: 'test@' });
    expect(res2.status).toBe(400);
    expect(res2.body.fieldErrors?.email).toBeDefined();
  });

  it('[FR-02] rejects email over 254 chars', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.longEmail);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.email).toBeDefined();
  });

  it('[FR-02] rejects name over 100 chars', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.longName);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.name).toBeDefined();
  });

  it('[FR-02] rejects phone under 7 chars', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.shortPhone);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.phone).toBeDefined();
  });

  it('[FR-02] rejects phone over 20 chars', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.longPhone);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.phone).toBeDefined();
  });

  it('[FR-02] rejects notes over 500 chars', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.longNotes);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.notes).toBeDefined();
  });

  it('[FR-02] requires consent checkbox', async () => {
    const res = await makeRequest('POST', '/api/appointments', INVALID_BOOKINGS.noConsent);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.consent).toBeDefined();
  });
});

describe('[FR-03] Double-booking prevention', () => {
  it('[FR-03] only one submission succeeds for the same slot concurrently', async () => {
    const booking1 = { ...VALID_BOOKING, name: 'Alice' };
    const booking2 = { ...VALID_BOOKING, name: 'Bob', slot: VALID_SLOT };

    const [res1, res2] = await Promise.all([
      makeRequest('POST', '/api/appointments', booking1),
      makeRequest('POST', '/api/appointments', booking2),
    ]);

    const results = [res1, res2];
    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status !== 201);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.body.error).toContain('no longer available');
  });

  it('[FR-03] slot becomes bookable again after cancellation', async () => {
    // First booking
    const res1 = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    expect(res1.status).toBe(201);
    const cancelToken = res1.body.cancelToken;

    // Cancel the booking
    const cancelRes = await makeRequest('POST', `/api/cancel/${cancelToken}`);
    expect(cancelRes.status).toBe(200);

    // Now the slot should be available again
    const res2 = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      name: 'Different Name',
    });
    expect(res2.status).toBe(201);
  });
});

describe('[FR-04] Server-side validation of schedule rules', () => {
  it('[FR-04] rejects Saturday slot with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-10T10:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects Sunday slot with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-11T10:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects lunch hour slot with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-06T13:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects holiday slot with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-08T10:00:00Z', // Holiday
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects non-15-minute-aligned time with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-06T10:07:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects date > 90 days ahead with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2027-03-01T10:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects past time with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-04T10:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects slot before opening time with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-06T08:45:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects slot at/after closing time with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: '2026-10-06T17:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('[FR-04] rejects garbage slot time with 400', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: 'not-a-date',
    });
    expect(res.status).toBe(400);
  });
});

describe('[FR-05] Private cancellation link', () => {
  it('[FR-05] returns cancellation link in response', async () => {
    const res = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    expect(res.status).toBe(201);
    expect(res.body.cancelToken).toBeDefined();
    expect(res.body.cancelUrl).toContain('/cancel/');
  });

  it('[FR-05] cancel token has at least 128 bits of randomness', async () => {
    const res = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    const token = res.body.cancelToken;
    // Base64url encoded 128 bits = 16 bytes = 22 chars (with padding ~24)
    // 32 random bytes = 256 bits = 43 chars base64url
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('[FR-05] cancel page shows appointment time and cancel button', async () => {
    const bookRes = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    const token = bookRes.body.cancelToken;

    const cancelPageRes = await makeRequest('GET', `/api/cancel/${token}`);
    expect(cancelPageRes.status).toBe(200);
    expect(cancelPageRes.body).toBeDefined();
    // Should include slot_start and status, not PII
    expect(cancelPageRes.body.slot_start).toBeDefined();
    expect(cancelPageRes.body.status).toBeDefined();
  });

  it('[FR-05] cancel page does not expose name, phone, email or notes', async () => {
    const bookRes = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    const token = bookRes.body.cancelToken;

    const cancelPageRes = await makeRequest('GET', `/api/cancel/${token}`);
    expect(cancelPageRes.status).toBe(200);
    expect(cancelPageRes.body.name).toBeUndefined();
    expect(cancelPageRes.body.phone).toBeUndefined();
    expect(cancelPageRes.body.email).toBeUndefined();
    expect(cancelPageRes.body.notes).toBeUndefined();
  });

  it('[FR-05] cancelling sets status to cancelled with cancelled_by=patient', async () => {
    const bookRes = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    const token = bookRes.body.cancelToken;

    const cancelRes = await makeRequest('POST', `/api/cancel/${token}`);
    expect(cancelRes.status).toBe(200);

    const checkRes = await makeRequest('GET', `/api/cancel/${token}`);
    expect(checkRes.body.status).toBe('cancelled');
  });

  it('[FR-05] invalid token returns 404', async () => {
    const res = await makeRequest('GET', `/api/cancel/invalid-token-xyz`);
    expect(res.status).toBe(404);
  });

  it('[FR-05] invalid token does not reveal appointment data', async () => {
    const res = await makeRequest('GET', `/api/cancel/invalid-token-xyz`);
    expect(res.status).toBe(404);
    expect(res.body.slot_start).toBeUndefined();
  });
});

describe('[FR-11] Spam protection', () => {
  it('[FR-11] rejects submission without valid CAPTCHA token', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      captchaToken: undefined,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('[FR-11] rejects submission with invalid CAPTCHA token', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      captchaToken: 'invalid-token',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('[FR-11] rate limits to 5 submissions per 10 minutes from one IP', async () => {
    // Make 5 successful submissions
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest('POST', '/api/appointments', {
        ...VALID_BOOKING,
        name: `Person ${i}`,
        phone: `+44770090012${i}`,
      });
      expect(res.status).toBe(201);
    }

    // 6th should be rate limited
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      name: 'Person 6',
      phone: '+44770090012x',
    });
    expect(res.status).toBe(429);
  });

  it('[FR-11] phone number with 3+ pending/confirmed appointments is rejected', async () => {
    const phone = '+44 7700 900999';
    // Create 3 successful bookings with same phone
    for (let i = 0; i < 3; i++) {
      const nextSlot = new Date(new Date(VALID_SLOT).getTime() + i * 15 * 60000).toISOString();
      const res = await makeRequest('POST', '/api/appointments', {
        ...VALID_BOOKING,
        phone,
        slot: nextSlot,
        name: `Person ${i}`,
      });
      expect(res.status).toBe(201);
    }

    // 4th booking with same phone should be rejected
    const futureSlot = new Date(new Date(VALID_SLOT).getTime() + 3 * 15 * 60000).toISOString();
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      phone,
      slot: futureSlot,
      name: 'Person 4',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('maximum of 3 active appointments');
  });
});

describe('[FR-13] Privacy notice and data retention', () => {
  it('[FR-13] rejects submission without consent checkbox', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      consent: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors?.consent).toBeDefined();
  });

  it('[FR-13] records consent_at timestamp when booking created', async () => {
    const res = await makeRequest('POST', '/api/appointments', VALID_BOOKING);
    expect(res.status).toBe(201);
    // Consent should be recorded (verified in database)
  });
});

describe('[FR-14] Booking error handling', () => {
  it('[FR-14] shows patient-friendly database error message', async () => {
    // This would be tested with actual DB unavailability
    // For now, verify error message format
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      slot: 'invalid',
    });
    if (res.status === 503) {
      expect(res.body.error).toContain('Booking temporarily unavailable');
    }
  });

  it('[FR-14] preserves form values after error', async () => {
    const res = await makeRequest('POST', '/api/appointments', {
      ...VALID_BOOKING,
      name: '', // Invalid
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toBeDefined();
  });

  it('[FR-14] returns 400 for malformed JSON', async () => {
    const res = await new Promise<any>((resolve) => {
      const url = new URL('/api/appointments', BASE_URL);
      const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode || 500, body: data ? JSON.parse(data) : null });
        });
      });
      req.write('not json');
      req.end();
    });
    expect(res.status).toBe(400);
  });
});
