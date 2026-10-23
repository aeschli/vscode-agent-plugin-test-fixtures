# VS Code agent plugin lifecycle fixtures

A publishable test repository for [microsoft/vscode#343747](https://github.com/microsoft/vscode/issues/343747). Tests local Copilot SDK-managed plugins versus client-provided configured and extension plugins. No remote Agent Host coverage.

## Requirements and safety

- Node.js 22+ on PATH in the environment launching VS Code/Copilot.
- A VS Code Insiders/dev build with plugin support, and access to the Copilot harness for live chat tests.
- Use a throwaway VS Code profile and a disposable workspace **outside this repository** so workspace discovery cannot mask plugin installation.
- These fixtures need no additional service accounts or secrets. Live model turns still require your normal Copilot access.
- Hooks append only fixture name, event, and timestamp to `~/.vscode-agent-plugin-test-fixtures/events.jsonl` (`%USERPROFILE%\.vscode-agent-plugin-test-fixtures\events.jsonl` on Windows). No prompt text is recorded.
- MCP servers use stdio, expose only `fixture_echo`, and perform no network or filesystem operations.
- Install only one source of the same plugin at a time. Uninstall between marketplace and direct-source runs.

## Contents

| Plugin | Purpose |
| --- | --- |
| `plugins/fixture-mixed` | Skill, command, agent, instruction, lifecycle hooks, MCP server |
| `plugins/fixture-hooks-only` | Hooks only; no prompt-file discovery anchor |
| `plugins/fixture-mcp-only` | MCP only; no prompt-file discovery anchor |
| `plugins/fixture-configured` | Mixed contributions with a separate identity for `chat.pluginLocations` |
| `extension/plugin` (`fixture-extension`) | Mixed contributions via a declarative `chatPlugins` extension |
| `.claude-plugin/marketplace.json` | Marketplace listing mixed, hooks-only, and MCP-only plugins |

Generated plugin directories are self-contained: installed caches and packaged extensions do not refer back to this checkout. Commit the generated files when publishing. Templates and `scripts/generate.mjs` keep copies consistent.

## Prepare and package

```sh
npm ci
npm run generate
npm test
npm run package-extension
```

The last command produces `dist/fixture-extension.vsix`. It packages locally; it does not publish an extension. The test publisher `plugin-fixture-tests` is only an identifier and does not require a Marketplace account for installing the VSIX.

`npm test` checks the catalog/layout, hooks and marker privacy, and the MCP protocol with real Node subprocesses, including invalid requests.

## Publish this repository

Create your own GitHub repository and push this directory, including generated plugin files and the lockfile, but excluding `node_modules` and `dist`. Attach the VSIX to a release if other testers should not need to build it.

Replace `OWNER/REPO` below with the repository you publish. Do not put private credentials into this repository. No remote, commit, GitHub repository, or release is created by the generation commands.

## 1. Marketplace installation

1. Select the **Copilot** harness and open **Chat Customizations → Plugins**.
2. In the plugin marketplace management UI, add `OWNER/REPO` as a marketplace source. Its catalog name is `vscode-agent-plugin-fixtures`.
3. Browse that marketplace and install `fixture-mixed`.
4. Run the checks below. Disable, enable, uninstall, and reinstall using the UI, verifying its state updates.
5. Repeat for `fixture-hooks-only` and `fixture-mcp-only`.

CLI equivalents (optional, for checking native ownership) are:

```sh
copilot plugin marketplace add OWNER/REPO
copilot plugin marketplace browse vscode-agent-plugin-fixtures
copilot plugin install fixture-mixed@vscode-agent-plugin-fixtures
copilot plugin disable fixture-mixed@vscode-agent-plugin-fixtures
copilot plugin enable fixture-mixed@vscode-agent-plugin-fixtures
copilot plugin uninstall fixture-mixed@vscode-agent-plugin-fixtures
```

Run those against the same Copilot home as VS Code when comparing inventories. Do not change your normal home just to run these commands: use a disposable environment if needed.

Before publishing, the SDK smoke check can register this local directory as a marketplace. **Local directory marketplaces are live sources:** uninstall can deactivate a plugin while retaining its available row. Do not use disappearance of every local-marketplace row as a deletion assertion. Use the published GitHub marketplace for the normal cached-install UI test.

## 2. Source installation

1. Uninstall the marketplace copy of the fixture first.
2. Open **Chat Customizations → Plugins → Install from Source**.
3. Enter `OWNER/REPO:plugins/fixture-mixed`.
4. Repeat the same lifecycle checks. Repeat with `OWNER/REPO:plugins/fixture-hooks-only` and `OWNER/REPO:plugins/fixture-mcp-only`.
5. Uninstall each direct installation through its installed item before switching source.

CLI equivalent:

```sh
copilot plugin install OWNER/REPO:plugins/fixture-mixed
copilot plugin list --json
copilot plugin disable fixture-mixed
copilot plugin enable fixture-mixed
copilot plugin uninstall fixture-mixed
```

Before publishing, use the absolute local path to `plugins/fixture-mixed` in Install from Source (or through the SDK smoke check). If a particular UI build accepts only repository sources, use the published repository syntax above.

## 3. `chat.pluginLocations`

Do not SDK-install this fixture. Add its directory to your throwaway profile's settings:

```json
{
  "chat.pluginLocations": {
    "/ABSOLUTE/PATH/vscode-agent-plugin-test-fixtures/plugins/fixture-configured": true
  }
}
```

On Windows use forward slashes, for example `C:/test/vscode-agent-plugin-test-fixtures/plugins/fixture-configured`.

1. Verify `fixture-configured` appears and run the checks below.
2. Test its plugin-level Disable/Enable actions.
3. Remove the setting entry and start a fresh chat: contributions must disappear, but files must remain on disk.
4. Re-add the entry and verify contributions return.
5. If also testing a `false` setting value, record it separately from plugin-level enablement; these are different controls.

## 4. Extension contribution

1. Run **Extensions: Install from VSIX...** and select `dist/fixture-extension.vsix`.
2. Reload if requested. Verify the **Agent Plugin Lifecycle Fixture** extension and `fixture-extension` plugin appear.
3. Run the checks below and test plugin-level Disable/Enable.
4. Separately disable/re-enable the owning extension, honoring any required reload, and verify plugin removal/restoration.
5. Uninstall the extension, reload if requested, and start a fresh chat: the plugin must be absent.

No extension-host JavaScript is needed: `extension/package.json` contributes `chatPlugins` with path `./plugin`. Do not add this directory to `chat.pluginLocations` or SDK-install it; doing so would invalidate the source-isolation test.

## Observable checks

Replace `NAME` with `fixture-mixed`, `fixture-configured`, or `fixture-extension` as appropriate.

| Contribution | Action | Expected result |
| --- | --- | --- |
| Skill | Invoke the `NAME-hello` skill from slash completion | Exactly `SKILL_OK_NAME` |
| Command | Invoke the `NAME-command` plugin command where supported | Exactly `COMMAND_OK_NAME` |
| Agent | Select `NAME-agent`; ask for the fixture agent identity | Exactly `AGENT_OK_NAME` |
| Instruction | In a normal Copilot chat, send `fixture instruction probe NAME` | Exactly `INSTRUCTION_OK_NAME` |
| MCP | Ask to call server `NAME` tool `fixture_echo` with `{"text":"hello"}` | Actual tool result `MCP_OK_NAME:hello` |
| Hook | Start a fresh chat and send one message | New `sessionStart` and `userPromptSubmitted` marker rows for `NAME` |

The instruction probe is an additional compatibility check, not a guaranteed native contribution: the standalone SDK used during preparation did not return the bundled rule through `instructions.discover`. Record that as a discovery limitation rather than assuming the rule was installed and applied. The plugin's skills, agents, hooks, and MCP checks do not depend on the rule.

The SDK namespaces agent IDs, for example `fixture-mixed:fixture-mixed-agent`, while the display name is `fixture-mixed-agent`. It may expose plugin commands through its skills/slash-command discovery rather than a separate commands list. Prompt-guided outputs are corroborating evidence; they are not a substitute for checking inventory, hook markers, and actual tool calls.

For hooks-only, check markers for `fixture-hooks-only`. For MCP-only, call `fixture_echo` on `fixture-mcp-only` and expect `MCP_OK_fixture-mcp-only:hello`. Neither should have agents, skills, commands, or instructions.

Read the marker file before and after each operation. `sessionStart` is per SDK session, not per UI interaction: reload/resume, subagents, or retries can create additional events. To check duplicate forwarding, compare one controlled fresh chat with one message, no subagents, and no retry; count rows by fixture and event. Do not treat all events as a single hook invocation.

For each source:

- Enabled: actual contributions work once, without duplicate rows/tools.
- Disabled: a **fresh** chat must not execute its hooks or call its MCP tool. Check absence from available tools rather than asking the model if it remembers a name.
- Re-enabled: contributions work again.
- Reload/resume: reload VS Code, reopen the old chat, send a message; then compare with a fresh chat.
- Removed: fresh chats lose contributions; reinstall restores them.
- UI: check plugin children, source navigation, matching Browse installed state, and absence of false installation timeouts.
- Forwarding: SDK marketplace/source installs must not appear as client plugin refs or loose-file bundles in `activeClientSet`. Configured and extension contributions must still be forwarded.
- Local harness: check retained client-discovered contributions separately from Copilot native execution.

Source navigation and hooks-only/MCP-only UI publication may expose existing gaps tracked in [microsoft/vscode#343572](https://github.com/microsoft/vscode/issues/343572). Record these separately from native execution failures.

## Optional SDK smoke check

If `@github/copilot-sdk` is installed, run `npm run test:sdk`. Alternatively use a compatible SDK already installed in a VS Code checkout:

```sh
npm run test:sdk -- /ABSOLUTE/PATH/vscode/node_modules/@github/copilot-sdk/dist/index.js
```

The script uses a newly created temporary Copilot home, installs only these fixtures, checks discovery and disable/enable/uninstall, tests local marketplace management, and removes that home at the end. It does not send a model turn or test VS Code UI. SDK warnings and partial hook-discovery errors are printed, not silently treated as complete discovery.

## Validation recorded during preparation

- `npm test`: hook execution and deterministic MCP calls checked in Node subprocesses.
- Real Copilot SDK `1.0.25`: local direct installs and discovery of mixed/hooks-only/MCP-only fixtures checked; marketplace catalog and disable/enable/deactivation checked using an isolated temporary home.
- A standalone SDK runtime reported `Standalone server does not support server effect 'hooks_explicit_plugins'` alongside the expected plugin hook rows. This is explicitly not proof of complete hook discovery or model-backed execution.
- The same runtime did not return the bundled plugin instruction through `instructions.discover`; the optional smoke check reports this limitation explicitly.
- GitHub-hosted marketplace/source installation, VS Code UI, live model turns, Local harness execution, and Windows execution still require manual testing after publishing.
