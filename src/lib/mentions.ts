// Mentions embedded in a plain-text comment body as `@[Name](uuid)`.
// Rendering parses tokens back into styled chips.

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; userId: string };

export function parseMentions(body: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let lastIndex = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (m.index > lastIndex) parts.push({ type: "text", text: body.slice(lastIndex, m.index) });
    parts.push({ type: "mention", name: m[1], userId: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < body.length) parts.push({ type: "text", text: body.slice(lastIndex) });
  return parts;
}

export function extractMentionUserIds(body: string): string[] {
  const ids = new Set<string>();
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) ids.add(m[2]);
  return Array.from(ids);
}

export function renderMentionsPlain(body: string): string {
  // For notification preview snippets etc.
  return body.replace(MENTION_RE, (_all, name: string) => `@${name}`);
}
