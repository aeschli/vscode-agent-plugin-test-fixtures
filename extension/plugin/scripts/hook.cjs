// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

'use strict';

const { appendFileSync, mkdirSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const [fixture, event] = process.argv.slice(2);
if (!/^fixture-[a-z-]+$/.test(fixture ?? '') || !['sessionStart', 'userPromptSubmitted'].includes(event)) {
	throw new Error('Expected a fixture name and sessionStart or userPromptSubmitted.');
}
const directory = process.env.FIXTURE_LOG_DIR || join(homedir(), '.vscode-agent-plugin-test-fixtures');
mkdirSync(directory, { recursive: true });
appendFileSync(join(directory, 'events.jsonl'), `${JSON.stringify({ fixture, event, timestamp: new Date().toISOString() })}\n`);
process.stdin.resume();
