/** Privacy notice wording is TBD by the client (FR-13); must be approved before go-live. */
export function PrivacyNotice() {
  return (
    <section aria-labelledby="privacy-title" className="rounded border border-gray-300 bg-gray-50 p-3 text-sm text-gray-800">
      <h2 id="privacy-title" className="font-semibold">
        Privacy notice
      </h2>
      <p className="mt-1">We collect the following data to manage your appointment:</p>
      <ul className="ml-5 list-disc">
        <li>Name</li>
        <li>Phone number</li>
        <li>Email (if you provide it)</li>
        <li>Notes (if you provide them)</li>
        <li>Appointment time</li>
      </ul>
      <p className="mt-1">Only clinic staff can view this information.</p>
      <p className="mt-1">Clinic contact: [client to provide]</p>
    </section>
  );
}
