# Agent Plugin Lifecycle Fixture

Test-only declarative extension contributing `fixture-extension` through `chatPlugins`. It has no extension-host entry point. The plugin supplies a skill, agent, command, instruction, two lifecycle hooks, and a credential-free MCP echo server.

The extension also contributes `fixture-extension-contributed-agent` directly through `chatAgents`, outside the plugin. Select it and ask for the fixture agent identity: expect exactly `AGENT_OK_fixture-extension-contributed`. This is separate from the plugin's `fixture-extension-agent`, which replies with `AGENT_OK_fixture-extension`.

Requires Node.js on PATH. When enabled, hooks append fixture/event/timestamp markers to `~/.vscode-agent-plugin-test-fixtures/events.jsonl`; no prompt text is recorded. The MCP server only echoes supplied text and uses no external services.

The extension also contributes `Reviewer` directly through `chatAgents`. Ask for the fixture agent identity: expect exactly `AGENT_OK_fixture-extension-reviewer`. The separate `fixture-reviewer` plugin in this repository supplies another agent named `Reviewer`, with marker `AGENT_OK_fixture-reviewer-reviewer`, for same-name discovery tests.

Disable or uninstall this extension to remove its plugin and both directly contributed agents. Plugin-level enablement is tested separately in Chat Customizations: disabling the plugin must not remove the directly contributed agents.
