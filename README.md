# RoboRev for VS Code

See your [RoboRev](https://github.com/roborev-dev/roborev) code review findings right inside VS Code — no terminal switching, no context lost.

RoboRev is an automated code review system that reviews every commit you make using AI agents like Claude Code and Gemini. It catches bugs, security issues, and code quality problems before they ever reach a PR. This extension brings those findings into your editor where you're already working.

<img width="511" height="383" alt="image" src="https://github.com/user-attachments/assets/3d6a061f-7485-43c8-b3c3-f7d784e36c8e" />

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

- [RoboRev CLI](https://github.com/roborev-dev/roborev) installed and on your PATH
- RoboRev daemon running (`roborev daemon start`)
- Repository initialized with `roborev init`

The extension activates automatically in any workspace that has a `.roborev-id` file (created by `roborev init`). It stays dormant in other workspaces.

## How It Works

The extension talks to the RoboRev CLI using `roborev list --json` and `roborev show --json` to fetch review data. It doesn't talk to the daemon directly — the CLI handles that.

Reviews refresh automatically:
- When VS Code regains focus
- Every 60 seconds while the window is active
- Manually via the refresh button in the sidebar header

### Why RoboRev?

RoboRev reviews every commit automatically via a post-commit hook. No PR required, no CI wait — you get feedback in seconds, on every commit, on every branch. It supports multiple AI agents (Claude Code, Gemini, Copilot, Codex, and more), configurable review guidelines per-repo, severity filtering, and even automated fix-and-re-review loops.

It's the fastest way to get a second pair of eyes on your code. Every commit. Every time.

## Commands

| Command | Description |
|---------|-------------|
| `RoboRev: Refresh Reviews` | Reload reviews from the CLI |
| `RoboRev: Close Review` | Mark a finding as resolved |
| `RoboRev: Reopen Review` | Reopen a previously resolved finding |
| `RoboRev: Open TUI` | Launch `roborev tui` in an integrated terminal |

## Getting Started

1. Install [RoboRev](https://github.com/roborev-dev/roborev):
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

4. Make a commit — RoboRev reviews it automatically. Open VS Code and you'll see the findings in the RoboRev sidebar.

## Configuration

RoboRev is configured via `~/.roborev/config.toml` (global) and `.roborev.toml` (per-repo). The extension reads review data from the CLI and respects whatever configuration you have set up.

See the [RoboRev documentation](https://github.com/roborev-dev/roborev) for configuration options including:
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
