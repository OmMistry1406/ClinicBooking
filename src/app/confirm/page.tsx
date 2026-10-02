export const dynamic = 'force-dynamic';

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = typeof token === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(token);
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Appointment requested</h1>
      <p className="mt-2">
        Your appointment request has been received and is pending confirmation by the clinic.
      </p>
      {valid && (
        <p className="mt-4">
          Need to cancel? Use your{' '}
          <a className="text-blue-700 underline" href={`/cancel/${token}`}>
            personal cancellation link
          </a>
          . Keep this link private.
        </p>
      )}
    </main>
  );
}
