// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(join(root, 'dist'), { recursive: true });
await copyFile(join(root, 'LICENSE'), join(root, 'extension', 'LICENSE'));
const definitions = [
	{ name: 'fixture-mixed', prompts: true, hooks: true, mcp: true },
	{ name: 'fixture-hooks-only', hooks: true },
	{ name: 'fixture-mcp-only', mcp: true },
	{ name: 'fixture-configured', prompts: true, hooks: true, mcp: true },
	{ name: 'fixture-extension', prompts: true, hooks: true, mcp: true, extension: true },
];

async function write(path, content) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content);
}

async function json(path, value) {
	await write(path, `${JSON.stringify(value, null, '\t')}\n`);
}

for (const fixture of definitions) {
	const directory = fixture.extension
		? join(root, 'extension', 'plugin')
		: join(root, 'plugins', fixture.name);
	await json(join(directory, 'plugin.json'), {
		name: fixture.name,
		description: `Deterministic plugin lifecycle fixture: ${fixture.name}.`,
		version: '1.0.0',
		license: 'MIT',
	});
	await mkdir(join(directory, 'scripts'), { recursive: true });
	for (const script of ['hook.cjs', 'mcp-server.cjs']) {
		if ((script === 'hook.cjs' && fixture.hooks) || (script === 'mcp-server.cjs' && fixture.mcp)) {
			await copyFile(join(root, 'templates', script), join(directory, 'scripts', script));
		}
	}
	if (fixture.hooks) {
		const command = event => `node "\${PLUGIN_ROOT}/scripts/hook.cjs" ${fixture.name} ${event}`;
		await json(join(directory, 'hooks.json'), {
			version: 1,
			hooks: Object.fromEntries(['sessionStart', 'userPromptSubmitted'].map(event => [event, [{
				type: 'command',
				bash: command(event),
				powershell: command(event),
				timeoutSec: 10,
			}]])),
		});
	}
	if (fixture.mcp) {
		await json(join(directory, '.mcp.json'), {
			mcpServers: {
				[fixture.name]: {
					type: 'stdio',
					command: 'node',
					args: ['${PLUGIN_ROOT}/scripts/mcp-server.cjs', fixture.name],
				},
			},
		});
	}
	if (fixture.prompts) {
		await write(join(directory, 'skills', `${fixture.name}-hello`, 'SKILL.md'),
			`---\nname: ${fixture.name}-hello\ndescription: 'Use when explicitly testing the ${fixture.name} plugin hello skill.'\nuser-invocable: true\n---\n\nReply with exactly: SKILL_OK_${fixture.name}\n`);
		await write(join(directory, 'agents', `${fixture.name}-agent.agent.md`),
			`---\nname: ${fixture.name}-agent\ndescription: 'Use when explicitly testing the ${fixture.name} plugin agent.'\nuser-invocable: true\n---\n\nWhen asked for the fixture agent identity, reply with exactly: AGENT_OK_${fixture.name}\nDo not modify files or call tools unless explicitly requested by the user.\n`);
		await write(join(directory, 'commands', `${fixture.name}-command.md`),
			`---\ndescription: 'Check the ${fixture.name} plugin command.'\n---\n\nReply with exactly: COMMAND_OK_${fixture.name}\n`);
		await write(join(directory, 'rules', `${fixture.name}.instructions.md`),
			`When the user sends exactly "fixture instruction probe ${fixture.name}", reply with exactly "INSTRUCTION_OK_${fixture.name}". This rule does not apply to any other message.\n`);
	}
}

await write(join(root, 'extension', 'agents', 'fixture-extension-contributed-agent.agent.md'),
	`---\nname: fixture-extension-contributed-agent\ndescription: 'Use when explicitly testing the extension chatAgents contribution, independently of its plugin.'\nuser-invocable: true\n---\n\nWhen asked for the fixture agent identity, reply with exactly: AGENT_OK_fixture-extension-contributed\nDo not modify files or call tools unless explicitly requested by the user.\n`);

await json(join(root, '.claude-plugin', 'marketplace.json'), {
	name: 'vscode-agent-plugin-fixtures',
	owner: { name: 'VS Code plugin test fixtures' },
	metadata: { description: 'Credential-free, deterministic plugin lifecycle fixtures.', version: '1.0.0' },
	plugins: definitions.filter(fixture => !fixture.extension && fixture.name !== 'fixture-configured').map(fixture => ({
		name: fixture.name,
		description: `Lifecycle test: ${fixture.name}`,
		version: '1.0.0',
		source: `./plugins/${fixture.name}`,
	})),
});
console.log('Generated plugin fixtures, extension assets, and marketplace catalog.');
