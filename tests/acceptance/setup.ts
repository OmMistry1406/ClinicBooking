/**
 * Acceptance test setup and utilities
 *
 * This setup file provides:
 * - Common HTTP request utilities
 * - Test fixtures and constants
 * - Environment validation
 * - Server connection utilities
 */

import * as http from 'http';

export const BASE_URL = 'http://127.0.0.1:3000';
export const REQUEST_TIMEOUT = 10000;

/**
 * Test account credentials (would be set up in Supabase before testing)
 */
export const TEST_STAFF = {
  email: 'staff@clinic.test',
  password: 'ValidPassword123', // Must be 12+ chars
};

/**
 * Clinic configuration for tests
 */
export const TEST_CONFIG = {
  CLINIC_TZ: 'UTC',
  OPEN_TIME: '09:00',
  CLOSE_TIME: '17:00',
  LUNCH_START: '13:00',
  LUNCH_END: '14:00',
  SLOT_MINUTES: 15,
  BOOKING_WINDOW_DAYS: 90,
  HOLIDAYS: ['2026-10-08', '2026-12-25', '2027-01-01'],
};

/**
 * Valid test booking data
 */
export const VALID_BOOKING = {
  slot: '2026-10-06T09:00:00Z',
  name: 'Test Patient',
  phone: '+44 7700 900123',
  email: 'test@example.com',
  notes: 'Test appointment',
  consent: true,
  captchaToken: '1x00000000000000000000AA', // Cloudflare test token that always passes
};

/**
 * Make an HTTP request to the test server
 */
export async function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'clinic-booking-acceptance-tests/1.0',
        ...headers,
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode || 500,
            body: parsed,
            headers: res.headers as Record<string, string>,
          });
        } catch (e) {
          resolve({
            status: res.statusCode || 500,
            body: data,
            headers: res.headers as Record<string, string>,
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${method} ${path} timed out after ${REQUEST_TIMEOUT}ms`));
    });

    req.on('error', (e) => {
      reject(new Error(`Request to ${method} ${path} failed: ${(e as Error).message}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Check if the test server is running and responding
 */
export async function isServerRunning(): Promise<boolean> {
  try {
    await makeRequest('GET', '/api/health');
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for the server to become available (with retries)
 */
export async function waitForServer(
  maxRetries: number = 30,
  retryDelayMs: number = 500
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (await isServerRunning()) {
      console.log(`Server is running`);
      return;
    }
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(
    `Server did not become available after ${maxRetries} attempts (waited ${maxRetries * retryDelayMs}ms)`
  );
}

/**
 * Generate a unique test phone number
 */
export function generatePhoneNumber(index: number): string {
  const paddedIndex = String(index).padStart(4, '0');
  return `+44770090${paddedIndex}`;
}

/**
 * Generate a unique test name
 */
export function generateName(index: number): string {
  return `Test Patient ${index}`;
}

/**
 * Generate a test slot time (offset from base slot)
 */
export function generateSlot(dayOffset: number = 0, slotOffset: number = 0): string {
  const baseDate = new Date('2026-10-06T09:00:00Z'); // Monday
  const newDate = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000 + slotOffset * 15 * 60 * 1000);
  return newDate.toISOString();
}

/**
 * Assert that an object is a valid ISO 8601 timestamp
 */
export function isValidISOTimestamp(value: any): boolean {
  if (typeof value !== 'string') return false;
  try {
    const date = new Date(value);
    return date.toISOString() === value;
  } catch {
    return false;
  }
}

/**
 * Assert that an object has required properties
 */
export function hasRequiredProperties(obj: any, props: string[]): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return props.every((prop) => prop in obj);
}
