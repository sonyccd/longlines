// fetch wrapper: identifies Long Lines to upstream APIs and never hangs.

const DEFAULT_PROJECT_URL = "https://github.com/sonyccd/longlines";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchOptions {
  timeoutMs?: number;
}

/** "LongLines/0.1 (+<project url>)", project url from LONGLINES_USER_AGENT_URL. */
export function userAgent(): string {
  const projectUrl = Deno.env.get("LONGLINES_USER_AGENT_URL")?.trim() || DEFAULT_PROJECT_URL;
  return `LongLines/0.1 (+${projectUrl})`;
}

async function fetchOk(url: string, accept: string, options: FetchOptions): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: accept },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  }
  return response;
}

/** GET a JSON document. Throws on non-2xx, timeout, or invalid JSON. */
export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const response = await fetchOk(url, "application/json", options);
  return await response.json();
}

/** GET a text document, trimmed. Throws on non-2xx or timeout. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchOk(url, "text/plain, */*", options);
  return (await response.text()).trim();
}
