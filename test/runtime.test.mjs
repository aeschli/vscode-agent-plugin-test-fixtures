// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = ['fixture-mixed', 'fixture-hooks-only', 'fixture-mcp-only', 'fixture-configured', 'fixture-extension'];
const directory = fixture => join(root, fixture === 'fixture-extension' ? 'extension/plugin' : `plugins/${fixture}`);
const json = async path => JSON.parse(await readFile(path, 'utf8'));

test('catalog paths, extension contribution, and prompt-free variants are correct', async () => {
	const catalog = await json(join(root, '.claude-plugin/marketplace.json'));
	for (const plugin of catalog.plugins) {
		assert.equal((await json(join(root, plugin.source, 'plugin.json'))).name, plugin.name);
	}
	assert.deepEqual((await json(join(root, 'extension/package.json'))).contributes.chatPlugins, [{ path: './plugin' }]);
	for (const fixture of ['fixture-hooks-only', 'fixture-mcp-only']) {
		assert.deepEqual((await readdir(directory(fixture))).sort(), fixture === 'fixture-hooks-only'
			? ['hooks.json', 'plugin.json', 'scripts']
			: ['.mcp.json', 'plugin.json', 'scripts']);
	}
});

test('every hook resolves its installed root and writes one marker per invocation', async () => {
	const temporary = await mkdtemp(join(tmpdir(), 'plugin-fixture-test-'));
	try {
		for (const fixture of fixtures.filter(name => name !== 'fixture-mcp-only')) {
			const config = await json(join(directory(fixture), 'hooks.json'));
			for (const [event, actions] of Object.entries(config.hooks)) {
				assert.equal(actions.length, 1);
				assert.equal(actions[0].bash, actions[0].powershell);
				const result = spawnSync(process.execPath, [join(directory(fixture), 'scripts/hook.cjs'), fixture, event], {
					input: '{"prompt":"must-not-be-recorded"}',
					env: { ...process.env, FIXTURE_LOG_DIR: temporary },
					encoding: 'utf8',
					timeout: 5000,
				});
				assert.equal(result.status, 0, result.stderr);
			}
		}
		const rows = (await readFile(join(temporary, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
		assert.deepEqual(rows.map(({ fixture, event }) => ({ fixture, event })), fixtures
			.filter(name => name !== 'fixture-mcp-only')
			.flatMap(fixture => ['sessionStart', 'userPromptSubmitted'].map(event => ({ fixture, event }))));
		assert.ok(rows.every(row => Object.keys(row).sort().join(',') === 'event,fixture,timestamp'));
	} finally {
		await rm(temporary, { recursive: true });
	}
});

for (const fixture of fixtures.filter(name => name !== 'fixture-hooks-only')) {
	test(`${fixture}: MCP initialize, list, call, and invalid requests`, async () => {
		const config = await json(join(directory(fixture), '.mcp.json'));
		const server = config.mcpServers[fixture];
		const requests = [
			{ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
			{ method: 'notifications/initialized' },
			{ id: 2, method: 'tools/list' },
			{ id: 3, method: 'tools/call', params: { name: 'fixture_echo', arguments: { text: 'hello' } } },
			{ id: 4, method: 'tools/call', params: { name: 'fixture_echo', arguments: { text: 42 } } },
			{ id: 5, method: 'missing' },
		].map(request => JSON.stringify({ jsonrpc: '2.0', ...request }));
		const result = spawnSync(process.execPath, server.args.map(arg => arg.replace('${PLUGIN_ROOT}', directory(fixture))), {
			input: `${requests.join('\n')}\nnot-json\n`,
			encoding: 'utf8',
			timeout: 5000,
		});
		assert.equal(result.status, 0, result.stderr);
		const replies = result.stdout.trim().split('\n').map(JSON.parse);
		assert.deepEqual({
			server: replies[0].result.serverInfo.name,
			tools: replies[1].result.tools.map(tool => tool.name),
			call: replies[2].result,
			errors: replies.slice(3).map(reply => reply.error.code),
		}, {
			server: fixture,
			tools: ['fixture_echo'],
			call: { content: [{ type: 'text', text: `MCP_OK_${fixture}:hello` }] },
			errors: [-32602, -32601, -32700],
		});
	});
}
