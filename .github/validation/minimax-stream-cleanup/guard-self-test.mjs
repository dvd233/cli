import assert from 'node:assert/strict';
let nativeCalls = 0;
globalThis.fetch = async (_input, init) => {
  nativeCalls++;
  assert.equal(init.redirect, 'error');
  return new Response('loopback fixture');
};
await import('./offline-preload.ts');
await assert.rejects(fetch('https://ci.invalid/never-contact'), /blocks non-loopback/);
assert.equal(nativeCalls, 0);
assert.equal(await (await fetch('http://127.0.0.1:1234/fixture')).text(), 'loopback fixture');
assert.equal(nativeCalls, 1);
console.log('PASS fetch guard: external request rejected before I/O; loopback redirect escape prohibited');
