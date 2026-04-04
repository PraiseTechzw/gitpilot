# 🚀 GitPilot — Auto Git for VS Code

Never write a commit message again. GitPilot automates your entire Git workflow directly inside VS Code — with smart commit messages, auto-commit on save, auto-push, and a full CLI.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Smart commit messages** | Analyses your diff and generates conventional, emoji, or plain messages automatically |
| **Auto-commit on save** | Watches for file changes and commits after a configurable period of inactivity |
| **Auto-push** | Optionally push to remote after every commit |
| **Beautiful sidebar** | Real-time view of changes, branch, recent commits, ahead/behind status |
| **Diff preview** | See exactly which files changed and how many lines before committing |
| **CLI tool** | Full `gitpilot` CLI for terminal power users |
| **Undo last commit** | One-click soft reset |
| **Keyboard shortcuts** | `Ctrl+Alt+C` to commit, `Ctrl+Alt+P` to commit & push |

---

## 🚀 Getting Started

### Install the extension

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **GitPilot**
4. Click Install

Or install from source:
```bash
git clone <this-repo>
cd gitpilot
npm install
# Press F5 in VS Code to launch Extension Development Host
```

### Install the CLI

```bash
cd gitpilot
npm link   # Makes `gitpilot` available globally
```

---

## 🎛 Sidebar Panel

Click the GitPilot icon in the Activity Bar (left sidebar) to open the panel.

The panel shows:
- **Branch** and sync status (ahead/behind remote)
- **Auto-commit / auto-push toggles** — flip them on without leaving the editor
- **Countdown timer** — shows how long until the next auto-commit
- **Changed files** — colour-coded (A = added, M = modified, D = deleted, R = renamed)
- **Commit message** — pre-filled from your diff, fully editable
- **Recent commits** — click any to copy the hash

---

## ⚙️ Settings

Open `Settings > Extensions > GitPilot` or add to your `settings.json`:

```json
{
  "gitpilot.autoCommit": false,
  "gitpilot.autoPush": false,
  "gitpilot.debounceSeconds": 30,
  "gitpilot.commitStyle": "conventional",
  "gitpilot.excludePatterns": ["*.log", "node_modules/**", ".env"]
}
```

| Setting | Default | Description |
|---|---|---|
| `autoCommit` | `false` | Commit automatically after inactivity |
| `autoPush` | `false` | Push after every commit |
| `debounceSeconds` | `30` | Seconds of inactivity before auto-commit |
| `commitStyle` | `conventional` | `conventional` / `simple` / `emoji` |
| `excludePatterns` | `[...]` | Files to ignore |

---

## 💬 Commit Message Styles

GitPilot generates commit messages by analysing your diff:

| Style | Example |
|---|---|
| `conventional` | `feat(auth): add login form` |
| `emoji` | `✨ [auth] add login form` |
| `simple` | `Add login form` |

It detects the commit **type** automatically:

| Type | Triggered by |
|---|---|
| `feat` | New files, large additions |
| `fix` | Keywords like "fix", "bug", "error" in diff |
| `docs` | `.md`, `.rst`, `/docs/` paths |
| `style` | `.css`, `.scss`, `.sass` files |
| `test` | `.spec.js`, `.test.ts`, `/__tests__/` |
| `refactor` | Renames, restructures, more deletions than additions |
| `chore` | Config files, lockfiles, `.env` |
| `build` | `Dockerfile`, `/scripts/`, `/build/` |
| `ci` | `.github/`, `.gitlab/`, `ci/` paths |

---

## 🖥 CLI Reference

```bash
gitpilot commit                     # Smart commit with auto-generated message
gitpilot commit -y                  # Skip confirmation prompt
gitpilot commit -m "my message"     # Use a custom message
gitpilot commit -s emoji            # Use emoji style

gitpilot push                       # Commit + push to remote

gitpilot status                     # Branch, changes, ahead/behind
gitpilot log                        # Last 10 commits (pretty)
gitpilot log 20                     # Last 20 commits

gitpilot undo                       # Undo last commit (soft reset)
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+C` / `Cmd+Alt+C` | Smart commit |
| `Ctrl+Alt+P` / `Cmd+Alt+P` | Commit and push |

---

## 📁 Project Structure

```
gitpilot/
├── package.json           # Extension manifest + dependencies
├── src/
│   ├── extension.js       # Main VS Code extension entry point
│   ├── git/
│   │   ├── gitOps.js      # Git operations (status, diff, commit, push...)
│   │   └── commitMessage.js # Smart commit message generation
│   └── ui/
│       └── panel.html     # Sidebar UI (self-contained HTML/CSS/JS)
├── cli/
│   └── gitpilot.js        # Standalone CLI tool
├── gitpilot_architecture.svg
└── README.md
```

---

## 🤝 Contributing

PRs welcome! Key areas to improve:
- AI-powered commit messages (plug in your Anthropic API key)
- Per-branch configuration
- Commit templates
- GitHub/GitLab PR creation

---

## 📄 License

MIT
