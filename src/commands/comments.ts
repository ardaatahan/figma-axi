// `figma-axi comments <key>` — list comments; `--add "text"` posts one,
// optionally pinned to a node with `--node`.

import type { CommandModule } from "../cli/router.js";
import { UsageError } from "../output/errors.js";
import { emitKV, emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { truncate } from "../output/truncate.js";
import { apiGet, apiPost } from "../figma/api.js";
import { normalizeNodeId, parseFileRef } from "../figma/urls.js";

interface Comment {
  id: string;
  message: string;
  user: { handle: string };
  created_at: string;
  resolved_at: string | null;
  parent_id?: string;
  order_id: string | null;
  client_meta: { node_id?: string } | null;
}

const FIELDS = ["id", "author", "created", "message", "node", "resolved", "reply_to"];
const MESSAGE_ROW_LIMIT = 200;

export const commentsCommand: CommandModule = {
  spec: {
    name: "comments",
    summary: "List comments on a file, or post one with --add",
    args: [{ name: "key-or-url", required: true, description: "Figma file key or file URL" }],
    flags: [
      { name: "add", type: "string", description: "post a new comment with this text" },
      { name: "node", type: "string", description: "with --add: pin the comment to this node id" },
      { name: "reply-to", type: "string", description: "with --add: reply to this comment id" },
      {
        name: "fields",
        type: "string",
        default: "id,author,created,message",
        description: `comma-separated columns from: ${FIELDS.join(", ")}`,
      },
      { name: "full", type: "boolean", description: "do not truncate long comment messages" },
    ],
    examples: [
      "figma-axi comments AbCdEf123456",
      'figma-axi comments AbCdEf123456 --add "Ship it" --node 1:2',
      "figma-axi comments AbCdEf123456 --fields id,author,node,resolved,message",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    const addText = parsed.flags["add"] as string | undefined;
    const nodeFlag = parsed.flags["node"] as string | undefined;
    const replyTo = parsed.flags["reply-to"] as string | undefined;
    if ((nodeFlag || replyTo) && addText === undefined) {
      throw new UsageError("--node and --reply-to only apply when posting", 'add --add "your comment text"');
    }

    if (addText !== undefined) {
      if (!addText.trim()) {
        throw new UsageError("comment text is empty", 'usage: --add "your comment text"');
      }
      const body: Record<string, unknown> = { message: addText };
      if (nodeFlag) {
        body["client_meta"] = { node_id: normalizeNodeId(nodeFlag), node_offset: { x: 0, y: 0 } };
      }
      if (replyTo) body["comment_id"] = replyTo;
      const posted = (await apiPost(`/v1/files/${ref.key}/comments`, body)) as Comment;
      print(
        emitKV([
          ["comment", "posted"],
          ["id", posted.id],
          ["author", posted.user.handle],
          ["created", posted.created_at],
          ...(nodeFlag ? ([["node", normalizeNodeId(nodeFlag)]] as Array<[string, unknown]>) : []),
        ]),
      );
      print(helpBlock([`figma-axi comments ${ref.key}`, `figma-axi comments ${ref.key} --add "<reply>" --reply-to ${posted.id}`]));
      return 0;
    }

    const fields = String(parsed.flags["fields"]).split(",").map((f) => f.trim());
    for (const f of fields) {
      if (!FIELDS.includes(f)) {
        throw new UsageError(`unknown field '${f}' for --fields`, `valid fields: ${FIELDS.join(", ")}`);
      }
    }

    const res = (await apiGet(`/v1/files/${ref.key}/comments`)) as { comments: Comment[] };
    const comments = res.comments;
    if (comments.length === 0) {
      print(`comments: 0 comments on file ${ref.key}`);
      print(helpBlock([`figma-axi comments ${ref.key} --add "<text>" --node <node-id>`]));
      return 0;
    }

    const full = Boolean(parsed.flags["full"]);
    let truncatedAny = false;
    const rows = comments.map((c) => {
      const t = truncate(c.message, MESSAGE_ROW_LIMIT);
      if (t.truncated) truncatedAny = true;
      return {
        id: c.id,
        author: c.user.handle,
        created: c.created_at,
        message: full || !t.truncated ? c.message : `${t.text}... (${t.totalChars} chars total)`,
        node: c.client_meta?.node_id ?? "",
        resolved: c.resolved_at ? "yes" : "",
        reply_to: c.parent_id ?? "",
      };
    });

    print(emitList("comments", rows, fields));
    if (truncatedAny && !full) {
      print(`note: long messages truncated at ${MESSAGE_ROW_LIMIT} chars; re-run with --full for complete text`);
    }
    print(
      helpBlock([
        `figma-axi comments ${ref.key} --add "<text>" --node <node-id>`,
        `figma-axi comments ${ref.key} --add "<text>" --reply-to <comment-id>`,
        `figma-axi node ${ref.key} <node-id>  # see what a pinned comment refers to`,
      ]),
    );
    return 0;
  },
};
