// Validation-only guard: allow existing loopback test fixtures and reject
// unstubbed external fetches before I/O. Forbid redirect escape from loopback.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    console.error(`[offline guard] blocked ${url.origin}${url.pathname}`);
    throw new Error('Offline validation blocks non-loopback HTTP');
  }
  return nativeFetch(input, { ...init, redirect: 'error' });
}) as typeof fetch;
