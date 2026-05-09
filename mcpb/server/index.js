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
  if (args.encrypt) flags.push("--encrypt");
  if (args.update_id) flags.push("--update", args.update_id);
  if (args.mime_override) flags.push("--mime", args.mime_override);
  return flags;
}

const ENCRYPT_DESC =
  "Encrypt content client-side; the decryption key is appended to the rendered_url " +
  "as a fragment (#k=...) and never sent to any server. Use for sensitive content. " +
  "The full URL is the secret — anyone with it can decrypt. Not compatible with public.";

const server = new McpServer({ name: "share-file", version: "1.0.0" });

server.registerTool(
  "share_file",
  {
    description:
      "Publish a file from disk to a shareable URL backed by a secret GitHub gist. " +
      "Returns JSON with the rendered_url to send to the user. Works for any browser-renderable " +
      "artifact (HTML, images, PDFs, audio/video, text/source). Requires gh and jq installed " +
      "and `gh auth login` completed. Do not use for files >900KB or content the user has flagged sensitive.",
    inputSchema: {
      path: z.string().describe("Absolute path to the file to share."),
      description: z
        .string()
        .optional()
        .describe("Gist description shown in the GitHub UI."),
      update_id: z
        .string()
        .optional()
        .describe(
          "If provided, update the gist with this ID instead of creating a new one. The rendered_url stays the same.",
        ),
      public: z
        .boolean()
        .optional()
        .describe("Create a public (listed) gist instead of secret. Default false."),
      encrypt: z.boolean().optional().describe(ENCRYPT_DESC),
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
      "Use when the artifact only exists in this conversation and isn't on disk yet. " +
      "Returns JSON with the rendered_url. The filename determines the MIME type and viewer behavior.",
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
        .describe("Gist description shown in the GitHub UI."),
      update_id: z
        .string()
        .optional()
        .describe(
          "If provided, update the gist with this ID instead of creating a new one.",
        ),
      public: z
        .boolean()
        .optional()
        .describe("Create a public (listed) gist instead of secret."),
      encrypt: z.boolean().optional().describe(ENCRYPT_DESC),
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
