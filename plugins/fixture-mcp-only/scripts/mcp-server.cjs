// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

'use strict';

const { createInterface } = require('node:readline');
const fixture = process.argv[2];
if (!/^fixture-[a-z-]+$/.test(fixture ?? '')) {
	throw new Error('Expected a fixture name.');
}

function response(id, result) {
	process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function error(id, code, message) {
	process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', line => {
	let request;
	try {
		request = JSON.parse(line);
	} catch {
		error(null, -32700, 'Invalid JSON');
		return;
	}
	if (!request || typeof request !== 'object' || Array.isArray(request)
		|| request.jsonrpc !== '2.0' || typeof request.method !== 'string'
		|| (request.id !== undefined && typeof request.id !== 'number' && typeof request.id !== 'string')) {
		error(null, -32600, 'Invalid JSON-RPC request');
		return;
	}
	if (request.id === undefined) {
		return;
	}
	switch (request.method) {
		case 'initialize':
			response(request.id, {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: fixture, version: '1.0.0' },
			});
			break;
		case 'ping':
			response(request.id, {});
			break;
		case 'tools/list':
			response(request.id, {
				tools: [{
					name: 'fixture_echo',
					description: `Return a deterministic ${fixture} marker and the supplied text. No network or filesystem access.`,
					inputSchema: {
						type: 'object',
						properties: { text: { type: 'string' } },
						required: ['text'],
						additionalProperties: false,
					},
				}],
			});
			break;
		case 'tools/call':
			if (request.params?.name !== 'fixture_echo' || typeof request.params?.arguments?.text !== 'string'
				|| Object.keys(request.params.arguments).some(key => key !== 'text')) {
				error(request.id, -32602, 'Expected fixture_echo with a single string text argument');
				break;
			}
			response(request.id, { content: [{ type: 'text', text: `MCP_OK_${fixture}:${request.params.arguments.text}` }] });
			break;
		default:
			error(request.id, -32601, 'Method not found');
	}
});
