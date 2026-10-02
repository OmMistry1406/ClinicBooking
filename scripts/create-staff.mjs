// Creates the single staff user via the Supabase Auth admin API.
// Usage: STAFF_EMAIL=you@clinic.example [STAFF_TEMP_PASSWORD=...] npm run create-staff
// The user must change the password (12+ chars) at first login: app_metadata.must_change_password=true.
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';

config({ path: '.env.local' });
config();

const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.STAFF_EMAIL;
if (!base || !key || !email) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STAFF_EMAIL are required.');
  process.exit(1);
}

let password = process.env.STAFF_TEMP_PASSWORD;
const generated = !password;
if (!password) password = randomBytes(18).toString('base64url');
if (password.length < 12) {
  console.error('STAFF_TEMP_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const res = await fetch(`${base}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  }),
});

if (!res.ok) {
  console.error(`Failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log(`Staff user created: ${email}`);
if (generated) console.log(`Temporary password (shown once): ${password}`);
