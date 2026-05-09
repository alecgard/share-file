// Cross-runtime crypto compatibility test.
//
// Encrypts via bin/share-file (bash + openssl) and decrypts via lib/decrypt.mjs
// (the same module the browser viewer imports). Catches any drift between the
// two implementations of the wire format.
//
// Run: node test/format.test.mjs

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decryptPayload } from '../lib/decrypt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'bin', 'share-file');

function bashEncrypt(plaintext) {
  const result = spawnSync('bash', ['-c', `source "${SCRIPT}"; encrypt_payload`], {
    input: plaintext,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`encrypt_payload failed (exit ${result.status}): ${result.stderr}`);
  }
  const nl = result.stdout.indexOf('\n');
  if (nl < 0) throw new Error(`unexpected encrypt_payload output: ${result.stdout}`);
  return { key: result.stdout.slice(0, nl), payload: result.stdout.slice(nl + 1) };
}

let passed = 0;
let failed = 0;

async function expectPass(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

async function expectThrow(name, fn, matcher) {
  try {
    await fn();
    console.log(`  FAIL  ${name}: expected throw, got success`);
    failed++;
  } catch (e) {
    if (matcher && !matcher.test(e.message)) {
      console.log(`  FAIL  ${name}: error didn't match ${matcher}: ${e.message}`);
      failed++;
    } else {
      console.log(`  PASS  ${name}`);
      passed++;
    }
  }
}

async function roundtrip(plaintext) {
  const { key, payload } = bashEncrypt(plaintext);
  if (key.length !== 22) throw new Error(`key wrong length: ${key.length} (expected 22)`);
  const decrypted = await decryptPayload(key, payload);
  if (decrypted !== plaintext) {
    throw new Error(`mismatch: expected ${plaintext.length} bytes, got ${decrypted.length}`);
  }
}

console.log('Cross-runtime crypto tests (bash encrypt → JS decrypt):');

await expectPass('ASCII string',           () => roundtrip('hello, world'));
await expectPass('Unicode (emoji + CJK)',  () => roundtrip('🔐 私の秘密 ñ'));
await expectPass('Empty string',           () => roundtrip(''));
await expectPass('Newlines preserved',     () => roundtrip('line one\nline two\nline three\n'));
await expectPass('Long string (50KB)',     () => roundtrip('x'.repeat(50000)));
await expectPass('JSON envelope shape',    () => roundtrip(JSON.stringify({
  filename: 'test.md', mime_type: 'text/markdown', encoding: 'raw',
  content: '# Hello\n\nbody',
})));
await expectPass('Multiple encrypts use different IVs', async () => {
  const a = bashEncrypt('same plaintext');
  const b = bashEncrypt('same plaintext');
  if (a.payload === b.payload) throw new Error('payloads identical — IV not random?');
  if (a.key === b.key) throw new Error('master keys identical — key not random?');
});

console.log('\nNegative tests (must fail):');

await expectThrow('Wrong key fails HMAC', async () => {
  const { payload } = bashEncrypt('secret');
  await decryptPayload('AAAAAAAAAAAAAAAAAAAAAA', payload);
}, /Authentication failed|HMAC/i);

await expectThrow('Tampered ciphertext fails HMAC', async () => {
  const { key, payload } = bashEncrypt('secret');
  // Flip a bit in the middle of the base64 payload.
  const half = Math.floor(payload.length / 2);
  const tampered = payload.slice(0, half) + (payload[half] === 'A' ? 'B' : 'A') + payload.slice(half + 1);
  await decryptPayload(key, tampered);
}, /Authentication failed|HMAC/i);

await expectThrow('Truncated payload rejected', async () => {
  const { key, payload } = bashEncrypt('secret');
  await decryptPayload(key, payload.slice(0, 20));
}, /too short|Authentication failed/i);

await expectThrow('Wrong-length key rejected', async () => {
  const { payload } = bashEncrypt('secret');
  await decryptPayload('shortkey', payload);
}, /Invalid key length|Authentication failed/i);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
