# roborev for VS Code

See your [roborev](https://github.com/roborev-dev/roborev) code review findings right inside VS Code — no terminal switching, no context lost.

roborev is an automated code review system that reviews every commit you make using AI agents like Claude Code and Gemini. It catches bugs, security issues, and code quality problems before they ever reach a PR. This extension brings those findings into your editor where you're already working.

**Review Details** 
<img width="1299" height="703" alt="image" src="https://github.com/user-attachments/assets/9ddb8211-40f0-4367-94e7-9543155a8f96" />
<br />
**In Progress** 
<img width="555" height="368" alt="image" src="https://github.com/user-attachments/assets/aa059032-7e4a-4c32-a51c-7dd1e25d524e" />

## What You Get

**Sidebar tree view** — all reviews for your current project, grouped by status:

- **In Progress** — reviews still running (spinner icon)
- **Needs Attention** — reviews that found issues you should look at (red indicator)
- **Passed** — clean reviews and resolved findings (green check)
- **History** — older reviews, collapsed by default

**Detail panel** — click any review to see the full findings rendered as markdown, with commit info, agent, verdict, and timestamps.

**Actions** — close/resolve findings and reopen them without leaving the editor. Right-click context menus and webview buttons.

**TUI shortcut** — jump to `roborev tui` in an integrated terminal for the full interactive experience.

## Requirements

- [roborev CLI](https://github.com/roborev-dev/roborev) installed and on your PATH
- roborev daemon running (`roborev daemon start`)
- Repository initialized with `roborev init`

The extension activates automatically in any workspace that has a `.roborev-id` file (created by `roborev init`). It stays dormant in other workspaces.

## How It Works

The extension talks to the roborev CLI using `roborev list --json` and `roborev show --json` to fetch review data. It doesn't talk to the daemon directly — the CLI handles that.

Reviews refresh automatically:
- When VS Code regains focus
- Every 60 seconds while the window is active
- Manually via the refresh button in the sidebar header

### Why roborev?

roborev reviews every commit automatically via a post-commit hook. No PR required, no CI wait — you get feedback in seconds, on every commit, on every branch. It supports multiple AI agents (Claude Code, Gemini, Copilot, Codex, and more), configurable review guidelines per-repo, severity filtering, and even automated fix-and-re-review loops.

It's the fastest way to get a second pair of eyes on your code. Every commit. Every time.

## Commands

| Command | Description |
|---------|-------------|
| `roborev: Refresh Reviews` | Reload reviews from the CLI |
| `roborev: Close Review` | Mark a finding as resolved |
| `roborev: Reopen Review` | Reopen a previously resolved finding |
| `roborev: Open TUI` | Launch `roborev tui` in an integrated terminal |

## Install

Download the latest `.vsix` from [GitHub Releases](https://github.com/sarcasticbird/vscode-roborev/releases) and install:

```bash
gh release download v0.1.0 --repo sarcasticbird/vscode-roborev
code --install-extension vscode-roborev-0.1.0.vsix
```

Or install directly in VS Code: `Cmd+Shift+P` → "Extensions: Install from VSIX..." and select the downloaded file.

## Getting Started

1. Install [roborev](https://github.com/roborev-dev/roborev):
   ```bash
   brew install roborev-dev/tap/roborev
   ```

2. Start the daemon:
   ```bash
   roborev daemon start
   ```

3. Initialize in your project:
   ```bash
   cd your-project
   roborev init
   ```

4. Make a commit — roborev reviews it automatically. Open VS Code and you'll see the findings in the roborev sidebar.

## Configuration

roborev is configured via `~/.roborev/config.toml` (global) and `.roborev.toml` (per-repo). The extension reads review data from the CLI and respects whatever configuration you have set up.

See the [roborev documentation](https://github.com/roborev-dev/roborev) for configuration options including:
- Default AI agent selection
- Review guidelines and criteria
- Severity filtering
- Multi-agent review support

## Development

```bash
# Install dependencies
flox activate -c 'npm install'

# Build
flox activate -c 'npm run build'

# Watch mode
flox activate -c 'npm run watch'

# Package
flox activate -c 'npx vsce package --allow-missing-repository'
```

Press F5 in VS Code to launch the Extension Development Host for testing.

## License

MIT
