// Validation-only probe adapted from independent blind review B.
import assert from 'node:assert/strict';
const { MiniMaxSDK } = await import(process.argv[2] || './dist/sdk.mjs');
const sdk = new MiniMaxSDK({ apiKey: 'ci-fixture-key', region: 'global', baseUrl: 'https://ci.invalid' });
const starts = {
  text: () => sdk.text.chat({ messages: [{ role: 'user', content: 'fixture' }], stream: true }),
  speech: () => sdk.speech.synthesize({ text: 'fixture', stream: true }),
  transcription: () => sdk.speech.transcribe({ file: new Blob(['fixture']), stream: true }),
};
let failures = 0;
globalThis.fetch = async () => { throw new Error('Unstubbed network denied'); };

function fixture(data, { contentType = 'text/event-stream', rejectCancel = false, eof = false, abortErrorsBody = false } = {}) {
  let controller;
  let open = true;
  let cancels = 0;
  let signal;
  const body = new ReadableStream({
    start(c) {
      controller = c;
      if (data) c.enqueue(new TextEncoder().encode(data));
      if (eof) { open = false; c.close(); }
    },
    cancel() {
      cancels++;
      open = false;
      return rejectCancel ? Promise.reject(new Error('cancel failure sentinel')) : undefined;
    },
  });
  const response = new Response(body, { headers: { 'content-type': contentType } });
  globalThis.fetch = async (_input, init) => {
    signal = init.signal;
    if (abortErrorsBody) signal.addEventListener('abort', () => {
      if (open) { open = false; controller.error(signal.reason); }
    }, { once: true });
    return response;
  };
  return {
    response, body,
    get cancels() { return cancels; },
    get aborted() { return signal?.aborted; },
    fail(error) { open = false; controller.error(error); },
    close() { if (open) { open = false; controller.close(); } },
  };
}
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}
for (const kind of ['text', 'speech']) {
  for (const rejectCancel of [false, true]) {
    await test(`${kind}: explicit return preserves non-undefined value, cancellation rejects=${rejectCancel}`, async () => {
      const f = fixture('data: {"v":1}\n\n', { rejectCancel });
      try {
        const stream = await starts[kind]();
        assert.deepEqual(await stream.next(), { done: false, value: { v: 1 } });
        const value = { sentinel: 'return-value' };
        assert.deepEqual(await stream.return(value), { done: true, value });
        assert.equal(f.cancels, 1);
        assert.equal(f.body.locked, false);
        assert.equal(f.aborted, true);
      } finally { f.close(); }
    });
    await test(`${kind}: consumer error identity preserved, cancellation rejects=${rejectCancel}`, async () => {
      const f = fixture('data: {"v":1}\n\n', { rejectCancel });
      const originalError = new Error('consumer sentinel');
      try {
        await assert.rejects(async () => {
          for await (const _ of await starts[kind]()) throw originalError;
        }, error => error === originalError);
        assert.equal(f.cancels, 1);
        assert.equal(f.body.locked, false);
      } finally { f.close(); }
    });
  }
  await test(`${kind}: fetch abort errors original stream, original JSON error preserved`, async () => {
    const f = fixture('data: invalid\n\n', { abortErrorsBody: true });
    try {
      await assert.rejects((await starts[kind]()).next(), error => error.name === 'SDKError' && error.message.startsWith('Failed to parse stream chunk:'));
      assert.equal(f.aborted, true);
      assert.equal(f.body.locked, false);
    } finally { f.close(); }
  });
  await test(`${kind}: injected throw preserves existing SDKError wrapping and cancels`, async () => {
    const f = fixture('data: {"v":1}\n\n', { rejectCancel: true });
    try {
      const stream = await starts[kind]();
      await stream.next();
      await assert.rejects(stream.throw(new Error('injected sentinel')), error => error.name === 'SDKError' && error.message === 'Failed to parse stream chunk: injected sentinel');
      assert.equal(f.cancels, 1);
      assert.equal(f.body.locked, false);
    } finally { f.close(); }
  });
  await test(`${kind}: empty EOF remains normal and unlocked`, async () => {
    const f = fixture('', { eof: true });
    assert.deepEqual(await (await starts[kind]()).next(), { done: true, value: undefined });
    assert.equal(f.cancels, 0);
    assert.equal(f.body.locked, false);
  });
  await test(`${kind}: unterminated EOF final event preserves UTF-8 and JSON`, async () => {
    const f = fixture('data: {"text":"你好"}', { eof: true });
    const stream = await starts[kind]();
    assert.deepEqual(await stream.next(), { done: false, value: { text: '你好' } });
    assert.deepEqual(await stream.next(), { done: true, value: undefined });
    assert.equal(f.body.locked, false);
  });
}
for (const ending of ['finish', 'done', 'json-error', 'read-error', 'throw', 'return']) {
  await test(`transcription: ${ending} with rejecting cleanup preserves result/error`, async () => {
    const data = ending === 'json-error' ? 'data: invalid\n\n' : 'data: {"index":0,"delta":"first","finish":' + (ending === 'finish') + '}\n\n' + (ending === 'done' ? 'data: [DONE]\n\n' : '');
    const f = fixture(data, { rejectCancel: true });
    try {
      const stream = await starts.transcription();
      if (ending === 'json-error') {
        await assert.rejects(stream.next(), error => error.name === 'SDKError' && error.message.startsWith('Failed to parse stream chunk:'));
      } else {
        assert.equal((await stream.next()).value.delta, 'first');
        if (ending === 'finish') assert.equal((await stream.next()).done, true);
        if (ending === 'done') await assert.rejects(stream.next(), /Stream ended before the final event/);
        if (ending === 'return') assert.deepEqual(await stream.return('value'), { done: true, value: 'value' });
        if (ending === 'throw') {
          const error = new Error('transcribe-consumer');
          await assert.rejects(stream.throw(error), e => e === error);
        }
        if (ending === 'read-error') {
          const error = new Error('read sentinel');
          f.fail(error);
          await assert.rejects(stream.next(), e => e === error);
        }
      }
      assert.equal(f.cancels, ending === 'read-error' ? 0 : 1);
      assert.equal(f.body.locked, false);
    } finally { f.close(); }
  });
}
// Deliberately diagnostic: this pre-parse validation path is outside the
// changed function and is compared against the baseline, not called a regression.
{
  const f = fixture('{"error":"unexpected"}', { contentType: 'application/json' });
  try {
    const stream = await starts.text();
    await assert.rejects(stream.next(), /Expected SSE stream/);
    console.log(`SCOPE text content-type rejection: cancel calls=${f.cancels}, body locked=${f.body.locked}, request aborted=${f.aborted}`);
  } finally { f.close(); }
}
await new Promise(resolve => setTimeout(resolve, 10));
console.log(`RESULT runtime=${typeof Bun === 'undefined' ? process.version : `bun-${Bun.version}`} failures=${failures}`);
process.exitCode = failures ? 1 : 0;
