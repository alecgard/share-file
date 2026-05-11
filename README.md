# share-file

Publish any single file — HTML page, image, PDF, screenshot, dashboard, audio
clip, video, source file, generated report — to a shareable URL backed by a
secret GitHub gist. Anyone with the link can view it through a static viewer
hosted on GitHub Pages.

- Uses your existing GitHub auth via the `gh` CLI.
- Single bash script, no build step.
- Works from a terminal or as a tool an agent can call.
- Updates reuse the same URL.

## Install

```bash
mkdir -p ~/.local/bin && \
  curl -fsSL https://raw.githubusercontent.com/alecgard/share-file/main/bin/share-file \
    -o ~/.local/bin/share-file && \
  chmod +x ~/.local/bin/share-file
```

## Share a file

```bash
$ share-file dashboard.html
Source:   https://gist.github.com/<you>/abc123
Rendered: https://alecgard.github.io/share-file/?abc123#k=Woa-2A8tTA-P3KfHS6ohUA
(copied to clipboard)
```

Encrypted client-side by default — the decryption key is appended to the rendered URL as a fragment (`#k=...`), which browsers never send to any server, so GitHub stores only ciphertext. The full URL is the secret. Lose it and the content is unrecoverable. See [Plain shares](#plain-shares) for the unencrypted alternative.

Here's a [live example](https://alecgard.github.io/share-file/?64a8a8cd0fbf41caac9ba9fca7fc353c) (plain, unencrypted).

## Use it from an agent

### Claude Code

Install the agent skill so [Claude Code](https://claude.ai/code) (or any agent
that loads skills) can call `share-file` for you:

```bash
mkdir -p ~/.claude/skills/share-file && \
  curl -fsSL https://raw.githubusercontent.com/alecgard/share-file/main/skill/SKILL.md \
    -o ~/.claude/skills/share-file/SKILL.md
```

Then ask the agent things like "share this dashboard with my team" or "give me a link to
that screenshot" — it'll call `share-file --json` and reply with the rendered
URL (encrypted by default, so the URL is the secret — only share through a
channel you trust). For project-scoped install, drop it in
`.claude/skills/share-file/` inside the repo instead.

### Claude Desktop

Download and drop the extension into Claude Desktop:


Download [**share-file.mcpb**](https://github.com/alecgard/share-file/releases/latest/download/share-file.mcpb)
and double-click it — Claude Desktop handles the install. (On Linux, drag it
into **Settings → Extensions**.)

Then ask Claude "share this PDF" or "give me a link to the chart you just made"
and the rendered URL comes back inline.

## Common operations

### Update an existing share (URL stays the same)

For encrypted shares (the default), pass `<gist-id>#k=<key>` so the same key is reused and the URL stays stable:

```bash
share-file --update "abc123#k=..." dashboard.html
```

For plain shares, the bare gist ID works:

```bash
share-file --no-encrypt --update abc123 dashboard.html
```

A full rendered URL is accepted anywhere an ID is, as a convenience for paste-from-clipboard.

Mode switches (plain↔encrypted) are supported and warn that the rendered URL changes.

### Read from stdin

```bash
echo "$html" | share-file --stdin --filename report.html
```

`--filename` is required so the viewer can detect the MIME type.

### JSON output for scripts and agents

```bash
$ share-file --json /path/to/chart.png
{
  "gist_id": "abc123",
  "source_url": "https://gist.github.com/<you>/abc123",
  "rendered_url": "https://alecgard.github.io/share-file/?abc123#k=Woa-2A8tTA-P3KfHS6ohUA",
  "filename": "chart.png",
  "mime_type": "image/png",
  "encoding": "base64",
  "encrypted": true
}
```

## Plain shares

Pass `--no-encrypt` to skip client-side encryption. The gist is still secret (unguessable), but anyone with the gist ID reads the content directly:

```bash
$ share-file --no-encrypt --desc "Q3 results" dashboard.html
Source:   https://gist.github.com/<you>/abc123
Rendered: https://alecgard.github.io/share-file/?abc123
```

`--public` is an independent visibility flag: a public (listed) gist shows up on your GitHub gist profile (default is secret/unlisted). It can combine with or without `--no-encrypt` — encrypted public gists are allowed but unusual.

```bash
share-file --public --no-encrypt --desc "Q3 results" dashboard.html
```

## Encrypted shares (default)

Without flags, content is AES-128-CBC encrypted client-side (HMAC-SHA256 authenticated) before upload, and the master key is appended to the rendered URL as a fragment.

- The browser fragment (`#...`) is never sent to any server, so GitHub stores only ciphertext and the public viewer never sees the key.
- Filename and MIME type are inside the encrypted blob; only the gist ID and the `[ShareFile] <desc>` description are visible to GitHub.
- The full URL is the secret. Anyone with it gets in; lose it and the content is unrecoverable — no copy is kept anywhere.
- `--desc` is honored under encryption (server-visible, useful for labeling) — avoid putting sensitive metadata in it.
- To update an encrypted share, pass `<id>#k=<key>` so the same key is reused and the URL stays stable: `share-file --update "<id>#k=<key>" file`. (A full rendered URL is accepted too, for convenience.)

### View locally without the viewer

```bash
share-file --view "abc123#k=Woa-2A8tTA-P3KfHS6ohUA"
```

Fetches, decrypts locally, and opens the result in your default browser via a temporary local HTML wrapper — no viewer involved, no third-party JS sees the content. The wrapper lives in a private temp dir (0700/0600) under `$TMPDIR` and is left in place so browser refresh keeps working; the OS reaps it on its own schedule. Works for plain shares too (just pass the gist ID). Markdown and other text types are shown as plain text in a `<pre>` block since there's no in-browser renderer. A full rendered URL is also accepted as a convenience for paste-from-clipboard.

For scripts and agents, `--read` returns the decoded content as JSON (`{filename, mime_type, encoding, content}`) instead of opening a browser:

```bash
share-file --read "abc123#k=..."
```

### List your shares

```bash
$ share-file --created
2026-05-09  encrypted  https://alecgard.github.io/share-file/?abc123#k=Woa-2A8tTA-P3KfHS6ohUA
2026-05-09  plain      https://alecgard.github.io/share-file/?def456
2026-05-08  encrypted  https://alecgard.github.io/share-file/?ghi789  (key not on this machine)
```

Lists every share-file gist on your account. Encrypted ones include the decryption key when share-file has seen it on this machine — keys are cached at `~/.config/share-file/keys/<gist_id>` whenever you create, update, view, or read an encrypted share. `--created --json` for machine-readable output.

## Supported file types

Renders inline in the viewer:

- HTML (sandboxed iframe)
- Images: PNG, JPG, GIF, SVG, WebP
- PDFs
- Audio and video
- Plain text, Markdown, JSON, XML, source code

Anything else is offered as a download link.

Size limit: 900KB encoded payload (~675KB raw for binaries; the gist API gets
unreliable above 1MB).

## Self-host your own viewer

By default shares render through the public viewer at
`alecgard.github.io/share-file/`. The viewer is static and only fetches the
gist by ID, so there's no shared backend.

You might want your own viewer for: a dedicated rate-limit bucket, your own
domain or team-scoped instance, or independence from the public viewer's
uptime. Gists you created against the public viewer keep working in your
viewer (and vice versa) — the gist ID travels.

One command does the whole thing — forks the repo, enables GitHub Pages on
the fork, and points your local `share-file` at the new viewer:

```bash
gh repo clone alecgard/share-file
cd share-file
./bin/setup
```

Re-running is safe — it skips steps already done. After ~30s your viewer is
live at `https://<you>.github.io/share-file/`.

### How the script picks a viewer

Resolution order:

1. `$SHARE_FILE_VIEWER` env var (overrides everything; useful per-shell)
2. `~/.config/share-file/viewer` (written by `bin/setup`)
3. Public default (`https://alecgard.github.io/share-file/`)

To switch viewers later without re-running setup:

```bash
echo "https://my-team.github.io/share-file/" > ~/.config/share-file/viewer
```

## Limits and caveats

- **Unguessable, not authenticated.** Anyone with the URL can view. With encryption (the default), the URL itself is the secret — share it through a channel you trust. Without encryption (`--no-encrypt`), the gist ID alone is enough.
- **Rate limit.** Unauthenticated GitHub API allows 60 requests/hour per
  viewer IP. Self-hosting gives you your own rate-limit bucket.
- **Single file per share.** Multi-file artifacts: inline assets or use a CDN.
- **GitHub visibility.** With encryption GitHub sees only ciphertext plus the `[ShareFile] <desc>` description (the description is always server-visible). Without encryption, gists are unguessable but readable by anyone with the ID, including GitHub.

## Upgrade

```bash
share-file --upgrade
```

Re-downloads the latest script (and the agent skill, if it's installed at `~/.claude/skills/share-file/`) from the upstream repo, overwriting the current install in place. Self-hosters can point at their fork with `SHARE_FILE_UPSTREAM=<owner>/<repo>`. Refuses to run if the script lives inside a git clone — use `git pull` there.

## Uninstall

Removes the script, the agent skill, and the local config (cached
decryption keys for `--created` listings live here too):

```bash
rm -f ~/.local/bin/share-file && \
  rm -rf ~/.claude/skills/share-file ~/.config/share-file
```

For the Claude Desktop extension, remove **share-file** from
**Settings → Extensions** in the Desktop app.

Already-published gists are not deleted — manage them at
<https://gist.github.com>.
