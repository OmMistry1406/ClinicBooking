/** Reads a JSON object body. Requires application/json (blocks cross-site form posts). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return null;
  try {
    const json: unknown = await request.json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    return json as Record<string, unknown>;
  } catch {
    return null;
  }
}
