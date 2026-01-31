// tools/repo-agent/src/util/discordText.ts

/**
 * Discord hard limits:
 * - message content max: 2000 characters
 *
 * This file centralizes clipping + formatting so command handlers can stay clean.
 */

export function clipText(text: string, maxChars: number, suffix = "\n…TRUNCATED…"): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.max(0, maxChars - suffix.length));
  return head + suffix;
}

export function toCodeBlock(text: string, lang = ""): string {
  const fence = "```";
  // prevent accidental fence breakouts
  const safe = (text ?? "").replace(/```/g, "\\`\\`\\`");
  return `${fence}${lang}\n${safe}\n${fence}`;
}

export function formatNameStatusList(nameStatus: string, maxLines = 40): string {
  const lines = (nameStatus ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return "(none)";

  const shown = lines.slice(0, maxLines);
  const extra = lines.length - shown.length;

  const body = shown.map((l) => `- ${l}`).join("\n");
  return extra > 0 ? body + `\n…+${extra} more…` : body;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}
