<p align="center">
  <img src="icon.png" alt="GitPilot logo" width="128" height="128" />
</p>

# GitPilot

[GitHub](https://github.com/PraiseTechzw/gitpilot) · [npm profile](https://www.npmjs.com/~praisetechzw)

GitPilot automates Git inside VS Code with smart commit messages, auto-commit on save, auto-push, a sidebar workflow, and a CLI for terminal use.

---

## Features

| Feature | Description |
|---|---|
| **Smart commit messages** | Analyzes your diff and generates conventional, emoji, or plain messages automatically |
| **Auto-commit on save** | Watches for file changes and commits after a configurable period of inactivity |
| **Auto-push** | Optionally push to remote after every commit |
| **Sidebar panel** | Real-time view of changes, branch, recent commits, and ahead/behind status |
| **Diff preview** | See exactly which files changed and how many lines before committing |
| **CLI tool** | Full `gitpilot` CLI for terminal power users |
| **Undo last commit** | One-click soft reset |
| **Keyboard shortcuts** | `Ctrl+Alt+C` to commit, `Ctrl+Alt+P` to commit and push |

---

## Install

### From VS Code

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **GitPilot**
4. Click Install

### From a VSIX file

If you build the extension locally, install the generated `.vsix` file with:

```bash
code --install-extension gitpilot-1.0.0.vsix
```

### From source
```bash
git clone <this-repo>
cd gitpilot
npm install
npm run package
# Press F5 in VS Code to launch the Extension Development Host
```

### CLI

```bash
cd gitpilot
npm link
```

### npm package

```bash
npm install -g @praisetechzw/gitpilot
```

To publish a new version after bumping `version` in [package.json](package.json):

```bash
npm run publish
```

### GitHub Packages

This repository can also publish to GitHub Packages using the workflow in [.github/workflows/github-packages.yml](.github/workflows/github-packages.yml).

Trigger it with a tag:

```bash
git tag pkg-v1.0.0
git push origin pkg-v1.0.0
```

Install from GitHub Packages:

```bash
npm install -g @praisetechzw/gitpilot --registry=https://npm.pkg.github.com
```

### What you need

- VS Code 1.74 or newer
- Git installed and available on your `PATH`
- A folder opened in VS Code that is already a git repository

---

## Usage

### VS Code panel

Click the GitPilot icon in the Activity Bar (left sidebar) to open the panel.

The panel shows:
- **Branch** and sync status (ahead/behind remote)
- **Auto-commit / auto-push toggles** — flip them on without leaving the editor
- **Countdown timer** — shows how long until the next auto-commit
- **Changed files** — colour-coded (A = added, M = modified, D = deleted, R = renamed)
- **Commit message** — pre-filled from your diff, fully editable
- **Recent commits** — click any to copy the hash

### CLI commands

Supported commands:

```bash
gitpilot commit [-y] [-m "message"] [-s conventional|simple|emoji]
gitpilot push [-s conventional|simple|emoji]
gitpilot status
gitpilot log [n]
gitpilot undo
```

---

## Settings

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
| `commitStyle` | `conventional` | `conventional`, `simple`, or `emoji` |
| `excludePatterns` | `[...]` | Files to ignore |

---

## Commit Message Styles

GitPilot generates commit messages by analyzing your diff:

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

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+C` / `Cmd+Alt+C` | Smart commit |
| `Ctrl+Alt+P` / `Cmd+Alt+P` | Commit and push |

---

## Project Structure

```
gitpilot/
├── package.json           # Extension manifest + dependencies
├── LICENSE
├── README.md
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
└── package-lock.json
```

---

## Contributing

PRs are welcome. Good next steps include AI-assisted commit messages, per-branch configuration, commit templates, and GitHub or GitLab PR creation.

---

## CI/CD

GitHub Actions are set up for two paths:

1. CI runs on push and pull requests to validate the code with install, lint, and package checks.
2. Release workflow runs when you push a tag like `v1.0.1` and produces a VSIX artifact and GitHub Release.

Release commands:

```bash
git tag v1.0.1
git push origin v1.0.1
```

If you add a `VSCE_PAT` secret in GitHub Actions, the release workflow can also publish to the Visual Studio Marketplace.

---

## License

MIT
