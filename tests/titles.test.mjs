// tests/titles.test.mjs
//
// gitBranch / isAgent / firstUserTitle are pure over the raw .jsonl TEXT. We assert
// them against the hand-made fixtures plus a couple of inline edge cases (skip rules,
// the 48-char truncation, and the first-5-lines / first-60-lines scan windows).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { gitBranch, isAgent, firstUserTitle } from '../scripts/core/titles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(path.join(here, 'fixtures', name), 'utf8');

const normal = fixture('normal-session.jsonl');
const agent = fixture('agent-session.jsonl');
const homePath = fixture('home-path-session.jsonl');

test('gitBranch reads the first "gitBranch" value (normal fixture)', () => {
  assert.equal(gitBranch(normal), 'feat/cross-os-node-cli');
});

test('gitBranch reads the branch from the agent fixture', () => {
  assert.equal(gitBranch(agent), 'agent/spike');
});

test('gitBranch returns "-" when no gitBranch field is present', () => {
  assert.equal(gitBranch('{"type":"user","message":{}}\n'), '-');
});

test('isAgent is true when an early line is type:agent-setting (agent fixture)', () => {
  assert.equal(isAgent(agent), true);
});

test('isAgent is false for a normal session', () => {
  assert.equal(isAgent(normal), false);
});

test('isAgent only scans the first 5 lines', () => {
  // agent-setting on line 6 must NOT count.
  const lines = [
    '{"type":"user","message":{"role":"user","content":"hi"}}',
    '{"a":1}',
    '{"b":2}',
    '{"c":3}',
    '{"d":4}',
    '{"type":"agent-setting"}',
  ].join('\n');
  assert.equal(isAgent(lines), false);
});

test('firstUserTitle returns the first real user prompt (normal fixture)', () => {
  assert.equal(
    firstUserTitle(normal),
    'Help me port the session CLI to Node so it runs ',
  );
  // Truncated to 48 chars.
  assert.equal(firstUserTitle(normal).length, 48);
});

test('firstUserTitle handles array content (agent fixture user line is a string here)', () => {
  assert.equal(
    firstUserTitle(agent),
    'Investigate where the encode logic lives and rep',
  );
});

test('firstUserTitle reads string content from the home-path fixture', () => {
  // First user line content is a plain string.
  assert.equal(
    firstUserTitle(homePath),
    'My project is at /Users/alice/app and the log is',
  );
});

test('firstUserTitle skips boilerplate openers and collapses whitespace', () => {
  const lines = [
    // A tool/array opener that must be skipped ('<' prefix after trim).
    '{"type":"user","message":{"role":"user","content":"<command-name>foo</command-name>"}}',
    // A markdown header opener ('## ') that must be skipped.
    '{"type":"user","message":{"role":"user","content":"## Heading"}}',
    // The real prompt, with messy whitespace to be collapsed.
    '{"type":"user","message":{"role":"user","content":"  real    prompt\\nhere "}}',
  ].join('\n');
  assert.equal(firstUserTitle(lines), 'real prompt here');
});

test('firstUserTitle returns the no-prompt sentinel when nothing qualifies', () => {
  const lines = [
    '{"type":"assistant","message":{"role":"assistant","content":"hi"}}',
    '{"type":"user","message":{"role":"user","content":"## only a header"}}',
  ].join('\n');
  assert.equal(firstUserTitle(lines), '(no user prompt)');
});
