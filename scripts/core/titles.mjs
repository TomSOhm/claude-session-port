// core/titles.mjs
//
// What: Parse the small set of fields the `list` command reads from a transcript:
//       git branch, agent flag, and the first real user prompt (the title hint).
// How:  Pure - operates on the raw .jsonl TEXT passed in (the command layer reads
//       the file). Faithful port of the PowerShell Get-Branch / Is-Agent / Get-Title.
// Deps: none (pure).
//
// Performance parity with the PowerShell: branch is scanned in the first 60 lines,
// agent flag in the first 5 lines; title scans until the first qualifying user msg.

// Scan windows / limits, matching the original PowerShell Get-Branch/Is-Agent/Get-Title.
const BRANCH_SCAN_LINES = 60; // gitBranch: only the first N lines
const AGENT_SCAN_LINES = 5; // isAgent: only the first N lines
const TITLE_MAX_CHARS = 48; // firstUserTitle: truncate the prompt to N chars

// Split JSONL into lines, tolerating CRLF and a trailing newline.
function toLines(jsonl) {
  return String(jsonl).split(/\r?\n/);
}

/**
 * gitBranch(jsonl) -> string
 * Returns the first `"gitBranch":"..."` value within the first 60 lines, else '-'.
 * Regex match (not full JSON parse) - matches the PowerShell behavior exactly.
 */
export function gitBranch(jsonl) {
  const lines = toLines(jsonl);
  const limit = Math.min(lines.length, BRANCH_SCAN_LINES);
  for (let i = 0; i < limit; i++) {
    const m = lines[i].match(/"gitBranch":"([^"]+)"/);
    if (m) return m[1];
  }
  return '-';
}

/**
 * isAgent(jsonl) -> boolean
 * True if any of the first 5 lines contains `"type":"agent-setting"` (subagent /
 * teammate session - hidden by /resume).
 */
export function isAgent(jsonl) {
  const lines = toLines(jsonl);
  const limit = Math.min(lines.length, AGENT_SCAN_LINES);
  for (let i = 0; i < limit; i++) {
    if (lines[i].includes('"type":"agent-setting"')) return true;
  }
  return false;
}

/**
 * firstUserTitle(jsonl) -> string  (max 48 chars)
 * Port of Get-Title:
 *  - consider only lines that look like user messages (`"type":"user"`),
 *  - JSON.parse each; read message.content (string, or first {type:'text'} item),
 *  - trim + collapse whitespace,
 *  - skip boilerplate openers (tool blocks, markdown headers, skill preambles),
 *  - return the first qualifying prompt truncated to 48 chars,
 *  - else '(no user prompt)'.
 */
export function firstUserTitle(jsonl) {
  const lines = toLines(jsonl);
  for (const line of lines) {
    if (!line.includes('"type":"user"')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const content = o && o.message ? o.message.content : undefined;
    let t;
    if (typeof content === 'string') {
      t = content;
    } else if (Array.isArray(content)) {
      const textItem = content.find((c) => c && c.type === 'text');
      t = textItem ? textItem.text : undefined;
    } else {
      continue;
    }
    if (!t) continue;
    t = t.trim().replace(/\s+/g, ' ');
    // Skip non-prompt openers: tool-result/array markers, markdown headers,
    // and the two known skill preambles.
    if (/^(<|\[|##\s|Base directory for this skill|A session-scoped)/.test(t)) continue;
    return t.slice(0, TITLE_MAX_CHARS);
  }
  return '(no user prompt)';
}
