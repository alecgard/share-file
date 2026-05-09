---
name: share-file
description: Publish a file to a shareable URL via GitHub gist. Use when the user wants to share any single browser-renderable artifact — HTML page, image, PDF, screenshot, mockup, report, generated chart, audio/video clip, or text/source file. Produces a clickable URL backed by a secret gist that renders via a static viewer. Triggers include "share this", "send to my team", "give me a link", "publish this". Do not use for content requiring authenticated access, files >900KB, or content the user has flagged sensitive.
---

# share-file

Publishes a file as a secret GitHub gist and returns a rendered viewer URL. Works for any file type the browser can render (HTML, images, PDFs, audio, video, text/source); other binaries get a download link in the viewer.

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
  "rendered_url": "https://alecgard.github.io/share-file/?abc123",
  "filename": "file.html",
  "mime_type": "text/html",
  "encoding": "raw"
}
```

## Updating an existing share

To revise something previously shared without changing the URL:

```bash
share-file --json --update <gist-id> /path/to/file.html
```

The rendered URL stays the same; the gist gets a new commit. The new file replaces the previous one (filename and MIME may change between versions).

## From stdin

When content is in memory rather than a file:

```bash
echo "$html" | share-file --json --stdin --filename report.html --desc "..."
```

`--filename` is required so the viewer knows the name and MIME type.

## Overriding MIME type

If `file(1)` mis-detects (e.g. an extensionless JSON file):

```bash
share-file --json --mime application/json --filename data.json data
```

## Encrypted shares

Pass `--encrypt` when the user asks for a private share, or when the content is sensitive enough that "unguessable URL" isn't enough:

```bash
share-file --json --encrypt /path/to/file.html
```

Returns the same JSON shape with `"encrypted": true` and `rendered_url` containing the decryption key as a URL fragment (`#k=...`). The full URL is the secret — anyone with it can decrypt; lose it and content is unrecoverable. To update an encrypted share, pass the full rendered URL to `--update` (the key in the fragment is reused so the URL stays stable). Not compatible with `--public`; `--desc` is ignored under `--encrypt`.

## Viewing or reading a share

`share-file --view <gist-id|rendered-url>` fetches the gist, decrypts locally if encrypted, builds a `data:` URL with the decoded content, and opens it in the user's default browser. Skips the third-party viewer entirely. Use when the user wants to preview a share without involving the public viewer.

`share-file --read <gist-id|rendered-url>` does the same fetch+decrypt but emits JSON to stdout (`{filename, mime_type, encoding, content}`) instead of opening a browser. Use when you need to read, summarize, or transform the contents of a share — no browser side effect.

## Listing the user's shares

`share-file --created` lists every share-file gist on the user's GitHub account. Encrypted shares include the decryption key in the URL when share-file has cached it locally (cached on every encrypted create/update/view/read). `--created --json` for parseable output. Use when the user asks "what have I shared?" or wants to revisit a past share.

## After publishing

Report the `rendered_url` to the user as the share link. Mention `source_url`
only if relevant (they want to edit the gist directly).

## Don't use for

- Files >900KB (binary files are base64-encoded, so the raw size budget is ~675KB; encryption adds ~33% on top)
- Multi-file artifacts (one file per gist; inline assets or use a CDN for HTML)
- Content requiring authenticated access — even with `--encrypt`, anyone with the URL gets in
