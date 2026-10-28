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

test('extension contributes a distinct custom agent outside the plugin', async () => {
	const manifest = await json(join(root, 'extension/package.json'));
	assert.deepEqual(manifest.contributes.chatAgents, [
		{ path: './agents/fixture-extension-contributed-agent.agent.md' },
		{ path: './agents/reviewer.agent.md' },
	]);
	const agent = await readFile(join(root, 'extension', manifest.contributes.chatAgents[0].path), 'utf8');
	assert.match(agent, /^---\nname: fixture-extension-contributed-agent\ndescription: '[^\n]+'\nuser-invocable: true\n---\n/);
	assert.match(agent, /reply with exactly: AGENT_OK_fixture-extension-contributed\n/);
	assert.match(agent, /Do not modify files or call tools unless explicitly requested by the user\./);
	const pluginAgent = await readFile(join(directory('fixture-extension'), 'agents/fixture-extension-agent.agent.md'), 'utf8');
	assert.match(pluginAgent, /^---\nname: fixture-extension-agent\n/);
	assert.match(pluginAgent, /reply with exactly: AGENT_OK_fixture-extension\n/);
});

test('extension and standalone plugin provide Reviewers with distinct identities', async () => {
	const catalog = await json(join(root, '.claude-plugin/marketplace.json'));
	assert.ok(catalog.plugins.some(plugin => plugin.name === 'fixture-reviewer' && plugin.source === './plugins/fixture-reviewer'));
	assert.deepEqual((await readdir(directory('fixture-reviewer'))).sort(), ['agents', 'plugin.json']);
	assert.deepEqual(await readdir(join(directory('fixture-reviewer'), 'agents')), ['reviewer.agent.md']);
	for (const [path, marker] of [
		[join(root, 'extension/agents/reviewer.agent.md'), 'AGENT_OK_fixture-extension-reviewer'],
		[join(directory('fixture-reviewer'), 'agents/reviewer.agent.md'), 'AGENT_OK_fixture-reviewer-reviewer'],
	]) {
		const agent = await readFile(path, 'utf8');
		assert.match(agent, /^---\nname: Reviewer\ndescription: '[^\n]+'\nuser-invocable: true\n---\n/);
		assert.ok(agent.includes(`reply with exactly: ${marker}\n`));
		assert.match(agent, /Do not modify files\./);
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
