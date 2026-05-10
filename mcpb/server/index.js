#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "..", "bin", "share-file");

// Claude Desktop launches MCP servers without the user's interactive shell PATH,
// so Homebrew-installed binaries (gh, jq) aren't found. Prepend the usual locations.
const SCRIPT_ENV = {
  ...process.env,
  PATH: [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    process.env.PATH || "",
  ]
    .filter(Boolean)
    .join(":"),
};

function runScript(args, stdinContent = null) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(SCRIPT_PATH, args, { env: SCRIPT_ENV });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", rejectRun);
    child.on("close", (code) => {
      resolveRun({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    if (stdinContent !== null) {
      child.stdin.write(stdinContent);
    }
    child.stdin.end();
  });
}

function toolResult(result) {
  if (result.code !== 0) {
    return {
      content: [
        {
          type: "text",
          text: result.stderr || `share-file exited with code ${result.code}`,
        },
      ],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: result.stdout }] };
}

function commonFlags(args) {
  const flags = [];
  if (args.description) flags.push("--desc", args.description);
  if (args.public) flags.push("--public");
  if (args.no_encrypt) flags.push("--no-encrypt");
  if (args.update_id) flags.push("--update", args.update_id);
  if (args.mime_override) flags.push("--mime", args.mime_override);
  return flags;
}

const NO_ENCRYPT_DESC =
  "Skip the default client-side encryption. Without this flag, content is " +
  "AES-128-CBC encrypted (HMAC-SHA256 authenticated) and the decryption key is " +
  "appended to the rendered_url as a fragment (#k=...) — GitHub stores only " +
  "ciphertext. Set true only when the user explicitly wants a plain share or " +
  "the content is non-sensitive (anyone with the gist ID can read it directly).";

const PUBLIC_DESC =
  "Create a public (listed) gist that shows up on the user's GitHub gist " +
  "profile. Default is secret (unlisted). Independent of no_encrypt — " +
  "encrypted public gists are allowed but unusual. Use only when the user " +
  "explicitly asks to publish publicly.";

const server = new McpServer({ name: "share-file", version: "1.0.0" });

server.registerTool(
  "share_file",
  {
    description:
      "Publish a file from disk to a shareable URL backed by a secret GitHub gist. " +
      "Encrypted client-side by default — the decryption key rides in the URL fragment " +
      "(#k=...), so GitHub stores only ciphertext. Returns JSON with the rendered_url " +
      "to send to the user. Works for any browser-renderable artifact (HTML, images, " +
      "PDFs, audio/video, text/source). Requires gh and jq installed and `gh auth login` " +
      "completed. Do not use for files >900KB.",
    inputSchema: {
      path: z.string().describe("Absolute path to the file to share."),
      description: z
        .string()
        .optional()
        .describe(
          "Gist description shown in the GitHub UI. Server-visible " +
            "regardless of encryption (only the file content is encrypted), so " +
            "avoid putting sensitive metadata here for encrypted shares.",
        ),
      update_id: z
        .string()
        .optional()
        .describe(
          "If provided, update the gist with this ID instead of creating a new one. " +
            "For encrypted shares pass the full rendered URL (with #k=...) so the key " +
            "can be reused and the URL stays stable; bare gist ID works for plain shares.",
        ),
      public: z.boolean().optional().describe(PUBLIC_DESC),
      no_encrypt: z.boolean().optional().describe(NO_ENCRYPT_DESC),
      mime_override: z
        .string()
        .optional()
        .describe(
          "Override MIME type detection (e.g. 'application/json' for an extensionless file).",
        ),
    },
  },
  async (args) => toolResult(await runScript(["--json", ...commonFlags(args), args.path])),
);

server.registerTool(
  "share_content",
  {
    description:
      "Publish inline content (a string) to a shareable URL backed by a secret GitHub gist. " +
      "Encrypted client-side by default — the decryption key rides in the URL fragment " +
      "(#k=...), so GitHub stores only ciphertext. Use when the artifact only exists in " +
      "this conversation and isn't on disk yet. Returns JSON with the rendered_url. " +
      "The filename determines the MIME type and viewer behavior.",
    inputSchema: {
      content: z.string().describe("The text content to share."),
      filename: z
        .string()
        .describe(
          "Filename to publish under (e.g. 'report.html', 'chart.svg', 'data.json'). The extension drives MIME detection.",
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Gist description shown in the GitHub UI. Server-visible " +
            "regardless of encryption.",
        ),
      update_id: z
        .string()
        .optional()
        .describe(
          "If provided, update the gist with this ID instead of creating a new one. " +
            "For encrypted shares pass the full rendered URL (with #k=...).",
        ),
      public: z.boolean().optional().describe(PUBLIC_DESC),
      no_encrypt: z.boolean().optional().describe(NO_ENCRYPT_DESC),
      mime_override: z
        .string()
        .optional()
        .describe("Override MIME type detection."),
    },
  },
  async (args) =>
    toolResult(
      await runScript(
        ["--json", "--stdin", "--filename", args.filename, ...commonFlags(args)],
        args.content,
      ),
    ),
);

const TARGET_DESC =
  "Either a bare gist ID (for plain shares) or the full rendered URL with " +
  "the #k=... fragment (required for encrypted shares — the key lives only in the URL).";

server.registerTool(
  "read_share",
  {
    description:
      "Fetch a share-file gist, decrypt it locally if encrypted, and return the decoded " +
      "content as JSON: {filename, mime_type, encoding, content}. For binary files, " +
      "encoding is 'base64' and content is the base64 string. Use this when the user wants " +
      "you to read, summarize, or transform the contents of a share — no browser involved.",
    inputSchema: {
      target: z.string().describe(TARGET_DESC),
    },
  },
  async (args) => toolResult(await runScript(["--read", args.target])),
);

server.registerTool(
  "view_share",
  {
    description:
      "Fetch a share-file gist, decrypt it locally if encrypted, and open the decoded " +
      "content in the user's default browser via a data: URL. No third-party viewer is " +
      "involved. Side effect: opens a browser tab on the user's machine — only use when " +
      "the user explicitly asks to preview or open a share.",
    inputSchema: {
      target: z.string().describe(TARGET_DESC),
    },
  },
  async (args) => toolResult(await runScript(["--view", args.target])),
);

const transport = new StdioServerTransport();
await server.connect(transport);
