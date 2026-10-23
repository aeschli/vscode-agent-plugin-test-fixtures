# Agent Plugin Lifecycle Fixture

Test-only declarative extension contributing `fixture-extension` through `chatPlugins`. It has no extension-host entry point. The plugin supplies a skill, agent, command, instruction, two lifecycle hooks, and a credential-free MCP echo server.

Requires Node.js on PATH. When enabled, hooks append fixture/event/timestamp markers to `~/.vscode-agent-plugin-test-fixtures/events.jsonl`; no prompt text is recorded. The MCP server only echoes supplied text and uses no external services.

Disable or uninstall this extension to remove its contribution. Plugin-level enablement is tested separately in Chat Customizations.
