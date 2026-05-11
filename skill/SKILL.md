---
name: share-file
description: Publish a file to a shareable URL via GitHub gist. Use when the user wants to share any single browser-renderable artifact — HTML page, image, PDF, screenshot, mockup, report, generated chart, audio/video clip, or text/source file. Produces a clickable URL backed by a secret GitHub gist that renders via a static viewer. Content is encrypted client-side by default (the decryption key rides in the URL fragment, so GitHub never sees it). Triggers include "share this", "send to my team", "give me a link", "publish this". Do not use for content requiring authenticated access or files >900KB.
---

# share-file

Publishes a file as a secret GitHub gist and returns a rendered viewer URL. Works for any file type the browser can render (HTML, images, PDFs, audio, video, text/source); other binaries get a download link in the viewer.

**Encrypted by default.** Content is AES-128-CBC encrypted client-side (HMAC-SHA256 authenticated) before upload. The decryption key is appended to the rendered URL as a fragment (`#k=...`), which browsers never send to any server, so GitHub stores only ciphertext. The full URL is the secret — anyone with it can decrypt; lose it and the content is unrecoverable.

## Invocation

The `share-file` bash script is on the user's PATH. Use `--json` for parseable output:

```bash
share-file --json --desc "Q3 dashboard" /path/to/file.html
```

Returns:

```json
{
  "gist_id": "abc123",
  "source_url": "https://gist.github.com/<user>/abc123",
  "rendered_url": "https://alecgard.github.io/share-file/?abc123#k=Woa-2A8tTA-P3KfHS6ohUA",
  "filename": "file.html",
  "mime_type": "text/html",
  "encoding": "raw",
  "encrypted": true
}
```

`--desc` is server-visible regardless of encryption (only the file content is encrypted) — useful for labeling shares so they're identifiable in `--created` and on GitHub, but avoid putting sensitive metadata in it for encrypted shares.

## Updating an existing share

For encrypted shares (the default), pass `<gist-id>#k=<key>` to `--update` so the same key is reused and the URL stays stable:

```bash
share-file --json --update "abc123#k=..." /path/to/file.html
```

For plain shares, the bare gist ID works:

```bash
share-file --json --no-encrypt --update <gist-id> /path/to/file.html
```

A full rendered URL is also accepted in place of `<id>#k=<key>`. Mode switches are supported (plain↔encrypted) and warn that the rendered URL changes.

## From stdin

When content is in memory rather than a file:

```bash
echo "$html" | share-file --json --stdin --filename report.html
```

`--filename` is required so the viewer knows the name and MIME type. Encryption still applies by default.

## Overriding MIME type

If `file(1)` mis-detects (e.g. an extensionless JSON file):

```bash
share-file --json --mime application/json --filename data.json data
```

## Plain (unencrypted) shares

When the user explicitly asks for a non-encrypted share, or when the content is non-sensitive and they want a shorter URL without a fragment:

```bash
share-file --json --no-encrypt --desc "Public chart" /path/to/file.html
```

Returns the same JSON shape with `"encrypted": false` and a `rendered_url` without the `#k=...` fragment. The gist is still secret (unguessable), but anyone with the gist ID reads the content directly. Prefer the encrypted default unless the user has a specific reason.

`--public` controls gist visibility independently: a public (listed) gist shows up on the user's GitHub gist profile (default is secret/unlisted). It can be combined with or without `--no-encrypt` — encrypted public gists are allowed but unusual. Use `--public` only when the user explicitly asks to publish publicly.

## Viewing or reading a share

`share-file --view <id>[#k=<key>]` fetches the gist, decrypts locally if encrypted, builds a `data:` URL with the decoded content, and opens it in the user's default browser. Skips the third-party viewer entirely. Use when the user wants to preview a share without involving the public viewer.

`share-file --read <id>[#k=<key>]` does the same fetch+decrypt but emits JSON to stdout (`{filename, mime_type, encoding, content}`) instead of opening a browser. Use when you need to read, summarize, or transform the contents of a share — no browser side effect.

Plain shares take just the gist ID; encrypted shares need the key as `<gist-id>#k=<key>`. A full rendered URL is also accepted for convenience.

## Listing the user's shares

`share-file --created` lists every share-file gist on the user's GitHub account. Encrypted shares include the decryption key in the URL when share-file has cached it locally (cached on every encrypted create/update/view/read). `--created --json` for parseable output. Use when the user asks "what have I shared?" or wants to revisit a past share.

## After publishing

Report the `rendered_url` to the user as the share link. For encrypted shares, point out that the URL itself is the secret — share it through a channel they trust. Mention `source_url` only if relevant (they want to edit the gist directly).

## Don't use for

- Files >900KB (binary files are base64-encoded, so the raw size budget is ~675KB; encryption adds ~33% on top)
- Multi-file artifacts (one file per gist; inline assets or use a CDN for HTML)
- Content requiring authenticated access — even with encryption, anyone with the URL gets in
