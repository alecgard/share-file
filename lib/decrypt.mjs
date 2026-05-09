// Decrypt payloads produced by `share-file --encrypt`.
//
// Wire format (must stay in sync with bin/share-file's encrypt_payload):
//   payload = base64( IV(16) || ciphertext || HMAC-SHA256(32) )
//   AES-128-CBC for encryption (PKCS#7 padded)
//   HMAC-SHA256 over (IV || ciphertext) for authentication
//   Master key is 16 random bytes; sub-keys derived as:
//     enc_key = first 16 bytes of SHA-256(0x01 || master)
//     mac_key = SHA-256(0x02 || master)
//
// Shared between the browser viewer (index.html) and the cross-runtime test
// (test/format.test.mjs). Works in any environment with WebCrypto (browsers
// and Node 19+).

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function b64urlToBytes(s) {
  const pad = (4 - s.length % 4) % 4;
  return b64ToBytes((s + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/'));
}

export function concatBytes(arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function decryptPayload(masterKeyB64url, payloadB64) {
  const master = b64urlToBytes(masterKeyB64url);
  if (master.length !== 16) throw new Error('Invalid key length');
  const blob = b64ToBytes(payloadB64);
  if (blob.length < 16 + 16 + 32) throw new Error('Encrypted payload too short');
  const iv = blob.subarray(0, 16);
  const mac = blob.subarray(blob.length - 32);
  const ct = blob.subarray(16, blob.length - 32);
  const encKeyBytes = (await sha256(concatBytes([new Uint8Array([0x01]), master]))).subarray(0, 16);
  const macKeyBytes = await sha256(concatBytes([new Uint8Array([0x02]), master]));
  const macKey = await crypto.subtle.importKey(
    'raw', macKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', macKey, mac, concatBytes([iv, ct]));
  if (!ok) throw new Error('Authentication failed (wrong key or tampered data)');
  const encKey = await crypto.subtle.importKey(
    'raw', encKeyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, encKey, ct);
  return new TextDecoder().decode(pt);
}
