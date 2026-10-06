// Validation-only probe adapted from independent blind review B.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
const { MiniMaxSDK } = await import(process.argv[2] || './dist/sdk.mjs');
const nativeFetch = globalThis.fetch;
let failures = 0;

for (const kind of ['text', 'speech', 'transcription']) {
  for (const ending of (kind === 'transcription' ? ['finish'] : ['done', 'break', 'return', 'json-error'])) {
    let response;
    let sawClose = false;
    let notifyClose;
    const closed = new Promise(resolve => { notifyClose = resolve; });
    const server = createServer((_req, res) => {
      response = res;
      res.on('close', () => { sawClose = true; notifyClose(); });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(ending === 'json-error' ? 'data: malformed\n\n' :
        kind === 'transcription' ? 'data: {"index":0,"delta":"first","finish":true}\n\n' :
        'data: {"v":1}\n\n' + (ending === 'done' ? 'data: [DONE]\n\n' : ''));
      // Intentionally keep the HTTP response open after the terminal event.
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        assert.equal(url.origin, baseUrl, 'Only the current loopback fixture may be contacted');
        return nativeFetch(input, { ...init, redirect: 'error' });
      };
      const sdk = new MiniMaxSDK({ apiKey: 'ci-fixture-key', region: 'global', baseUrl });
      const stream = await (kind === 'text' ? sdk.text.chat({ messages: [{ role: 'user', content: 'fixture' }], stream: true }) :
        kind === 'speech' ? sdk.speech.synthesize({ text: 'fixture', stream: true }) :
        sdk.speech.transcribe({ file: new Blob(['fixture']), stream: true }));
      if (ending === 'json-error') await assert.rejects(stream.next(), /Failed to parse stream chunk/);
      else if (ending === 'return') {
        await stream.next();
        assert.deepEqual(await stream.return('sentinel'), { done: true, value: 'sentinel' });
      } else {
        const values = [];
        for await (const value of stream) { values.push(value); if (ending === 'break') break; }
        assert.equal(values.length, 1);
      }
      let timer;
      await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
      clearTimeout(timer);
      assert.equal(sawClose, true, 'HTTP response remains open after active iterator terminated');
      console.log(`PASS transport ${kind}/${ending}: response close observed`);
    } catch (error) {
      failures++;
      console.log(`FAIL transport ${kind}/${ending}: ${error.message}`);
    } finally {
      response?.end();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}
console.log(`RESULT runtime=${typeof Bun === 'undefined' ? process.version : `bun-${Bun.version}`} failures=${failures}`);
process.exitCode = failures ? 1 : 0;
