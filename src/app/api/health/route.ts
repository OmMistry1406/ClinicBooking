import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const config = loadConfig();
    return NextResponse.json({ status: 'ok', clinicTz: config.clinicTz });
  } catch {
    // Do not leak internal details; misconfiguration is visible in server logs.
    console.error('Health check failed: invalid configuration');
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
