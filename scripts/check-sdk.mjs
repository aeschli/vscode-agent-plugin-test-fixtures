// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sdkModule = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@github/copilot-sdk';
const { CopilotClient } = await import(sdkModule);
const root = fileURLToPath(new URL('../', import.meta.url));
const home = await mkdtemp(join(tmpdir(), 'agent-plugin-fixture-sdk-'));
const client = new CopilotClient({
	useLoggedInUser: false,
	logLevel: 'error',
	env: { ...process.env, HOME: home, USERPROFILE: home, COPILOT_HOME: home, XDG_CONFIG_HOME: home },
});

try {
	await client.start();
	const fixtures = ['fixture-mixed', 'fixture-hooks-only', 'fixture-mcp-only', 'fixture-reviewer'];
	for (const name of fixtures) {
		await client.rpc.plugins.install({ source: join(root, 'plugins', name) });
	}
	const plugins = (await client.rpc.plugins.list()).plugins;
	assert.deepEqual(plugins.map(plugin => plugin.name).sort(), [...fixtures].sort());
	assert.ok(plugins.every(plugin => plugin.enabled));

	const hooks = await client.rpc.hooks.discover({});
	assert.deepEqual(hooks.hooks.filter(hook => hook.origin === 'plugin').map(hook => `${hook.source}:${hook.hookType}`).sort(), [
		'fixture-hooks-only:sessionStart', 'fixture-hooks-only:userPromptSubmitted',
		'fixture-mixed:sessionStart', 'fixture-mixed:userPromptSubmitted',
	].sort());
	for (const message of [...hooks.warnings, ...hooks.errors]) {
		console.warn(`SDK hook diagnostic: ${message}`);
	}
	const mcp = await client.rpc.mcp.discover({ workingDirectory: home, includeEffectiveSource: true });
	assert.deepEqual(mcp.servers.filter(server => server.source === 'plugin').map(server => server.name).sort(), ['fixture-mcp-only', 'fixture-mixed']);
	const skills = await client.rpc.skills.discover({ projectPaths: [home] });
	assert.ok(skills.skills.some(skill => skill.name === 'fixture-mixed-hello' && skill.source === 'plugin'));
	const agents = await client.rpc.agents.discover({ projectPaths: [home] });
	assert.ok(agents.agents.some(agent => agent.id === 'fixture-mixed:fixture-mixed-agent' && agent.source === 'plugin'), JSON.stringify(agents, null, 2));
	assert.ok(agents.agents.some(agent => agent.displayName === 'Reviewer' && agent.id === 'fixture-reviewer:reviewer' && agent.source === 'plugin'), JSON.stringify(agents, null, 2));
	const instructions = await client.rpc.instructions.discover({ projectPaths: [home] });
	if (!instructions.sources.some(source => source.sourcePath.includes('fixture-mixed.instructions.md'))) {
		console.warn('SDK discovery limitation: fixture plugin rule was not returned by instructions.discover.');
	}

	await client.rpc.plugins.disable({ names: fixtures });
	assert.ok((await client.rpc.plugins.list()).plugins.every(plugin => !plugin.enabled));
	const disabledHooks = await client.rpc.hooks.discover({});
	assert.ok(!disabledHooks.hooks.some(hook => hook.origin === 'plugin'));
	const disabledMcp = await client.rpc.mcp.discover({ workingDirectory: home });
	assert.ok(!disabledMcp.servers.some(server => server.source === 'plugin'));
	const disabledAgents = await client.rpc.agents.discover({ projectPaths: [home] });
	assert.ok(!disabledAgents.agents.some(agent => agent.source === 'plugin'));
	await client.rpc.plugins.enable({ names: fixtures });
	assert.ok((await client.rpc.plugins.list()).plugins.every(plugin => plugin.enabled));
	for (const plugin of plugins) {
		await client.rpc.plugins.uninstall({ name: plugin.name, directSourceId: plugin.directSourceId });
	}
	assert.deepEqual((await client.rpc.plugins.list()).plugins, []);
	console.log('Direct install, discovery, disable, enable, and uninstall: passed.');

	await client.rpc.plugins.marketplaces.add({ source: root });
	const catalog = await client.rpc.plugins.marketplaces.browse({ name: 'vscode-agent-plugin-fixtures' });
	assert.deepEqual(catalog.plugins.map(plugin => plugin.name).sort(), [...fixtures].sort());
	const spec = 'fixture-mixed@vscode-agent-plugin-fixtures';
	await client.rpc.plugins.install({ source: spec });
	assert.ok((await client.rpc.plugins.list()).plugins.some(plugin => plugin.name === 'fixture-mixed' && plugin.enabled));
	await client.rpc.plugins.disable({ names: [spec] });
	assert.ok((await client.rpc.plugins.list()).plugins.every(plugin => !plugin.enabled));
	await client.rpc.plugins.enable({ names: [spec] });
	assert.ok((await client.rpc.plugins.list()).plugins.some(plugin => plugin.name === 'fixture-mixed' && plugin.enabled));
	await client.rpc.plugins.uninstall({ name: spec });
	assert.ok((await client.rpc.plugins.list()).plugins.every(plugin => !plugin.enabled));
	console.log('Local live marketplace browse, install, disable, enable, and uninstall/deactivate: passed.');
	console.log('This checks discovery and management, not a model-backed turn or VS Code UI.');
} finally {
	await client.stop();
	await rm(home, { recursive: true });
}
