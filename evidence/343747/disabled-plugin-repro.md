# Disabled SDK-managed plugin still executes native hooks

Testing microsoft/vscode#343747 using a local Code OSS Dev 1.144.0, macOS arm64, Copilot harness, with dbgjs attached to the agent host and renderer.

Baseline: microsoft/vscode main `47d7fb3529a` plus forwarding patch `38b288dd9c4` from microsoft/vscode#343899, locally cherry-picked as `52136953133`. SDK: `@github/copilot-sdk` 1.0.26.

Fixtures: aeschli/vscode-agent-plugin-test-fixtures at `7c92325e32fb4a1c232ce3b675d41129eece0540`.

## Reproduction

1. Start Code OSS with an isolated profile and isolated `COPILOT_HOME`.
2. Select the Copilot harness. Install from source: `aeschli/vscode-agent-plugin-test-fixtures:plugins/fixture-mixed`.
3. Send a message. Verify hook markers in `~/.vscode-agent-plugin-test-fixtures/events.jsonl` (the test overrode `FIXTURE_LOG_DIR` to an isolated evidence directory).
4. Open Agent Customizations > Plugins; search for `fixture`. The provider-native row is currently labeled Remote Session / Remote agent host, even though the host is local.
5. Choose More actions for fixture-mixed > Disable. Verify the row status is Disabled.
6. Start a genuinely new Copilot chat and send `Reply with exactly DISABLED_CHECK. Do not use tools.`
7. Compare the hook marker file with its previous contents.

Expected: no new hook invocations for fixture-mixed.

Actual: both its sessionStart and userPromptSubmitted hooks still execute:

```jsonl
{"fixture":"fixture-mixed","event":"sessionStart","timestamp":"2026-10-23T22:54:25.331Z"}
{"fixture":"fixture-hooks-only","event":"sessionStart","timestamp":"2026-10-23T22:54:25.377Z"}
{"fixture":"fixture-mixed","event":"userPromptSubmitted","timestamp":"2026-10-23T22:54:27.291Z"}
{"fixture":"fixture-hooks-only","event":"userPromptSubmitted","timestamp":"2026-10-23T22:54:27.331Z"}
```

The hooks-only plugin was intentionally left enabled as a positive control. In the same operation, disabling the configured and extension fixtures stopped their hook markers. Their rows reported Disabled too.

After reloading the window and sending another message to the disabled chat, fixture-mixed again appended a userPromptSubmitted marker. This second check tests resume, not a second fresh-session reproduction.

Before disablement, actual tool.execution_complete events independently confirmed four successful tool results: MCP_OK_fixture-mixed:matrix, MCP_OK_fixture-mcp-only:matrix, MCP_OK_fixture-configured:matrix, MCP_OK_fixture-extension:matrix. Model responses alone were not used as execution evidence.

The screenshots show the UI disabled state and the local provider plugin's misleading remote provenance. These tests do not establish whether the behavior is newly introduced by the forwarding patch; no before-patch comparison has been performed.
