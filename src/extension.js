const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const gitOps = require('./git/gitOps');
const { generateMessage, fallbackMessage } = require('./git/commitMessage');

let repoRoot = null;
let statusBarItem = null;
let fileWatcher = null;
let timerInterval = null;
let timerRemaining = 0;
let lastStatusState = 'idle'; // 'idle', 'dirty', 'countdown', 'active', 'error'
let animationTick = 0; // Fine-grained tick for animations
let webviewPanel = null;
let outputChannel = null;

function activate(context) {
  outputChannel = vscode.window.createOutputChannel('GitPilot');
  log('Activating GitPilot...');

  repoRoot = detectRepoRoot();
  if (!repoRoot) {
    log('No git repository found in workspace yet. UI will stay available.');
  } else {
    checkCredentials();
  }

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'gitpilot.openPanel';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  context.subscriptions.push(
    vscode.commands.registerCommand('gitpilot.commit', () => runCommit(false)),
    vscode.commands.registerCommand('gitpilot.commitAndPush', () => runCommit(true)),
    vscode.commands.registerCommand('gitpilot.toggleAutoCommit', toggleAutoCommit),
    vscode.commands.registerCommand('gitpilot.toggleAutoPush', toggleAutoPush),
    vscode.commands.registerCommand('gitpilot.undo', runUndo),
    vscode.commands.registerCommand('gitpilot.openPanel', openPanel),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitpilot.panel', {
      resolveWebviewView(view) {
        webviewPanel = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = getPanelHtml();

        view.webview.onDidReceiveMessage((message) => handleWebviewMessage(message));
        setTimeout(() => sendPanelState(), 200);
      },
    }),
  );

  setupFileWatcher(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('gitpilot')) return;
      
      // Update HTML if UI experimental mode changed
      if (event.affectsConfiguration('gitpilot.experimentalUI') && webviewPanel) {
        webviewPanel.webview.html = getPanelHtml();
      }

      setupFileWatcher(context);
      updateStatusBar();
      sendPanelState();
    }),
  );

  const refreshHandle = setInterval(() => {
    if (!repoRoot) {
      repoRoot = detectRepoRoot();
    }
    animationTick = (animationTick + 1) % 60; // 500ms * 60 = 30s cycle
    if (webviewPanel?.visible) sendPanelState();
    updateStatusBar();
  }, 500); // Faster refresh for animations

  context.subscriptions.push({ dispose: () => clearInterval(refreshHandle) });
  log('GitPilot ready.');
}

function deactivate() {
  clearDebounce();
  fileWatcher?.dispose();
  outputChannel?.dispose();
}

function detectRepoRoot() {
  const folders = vscode.workspace.workspaceFolders || [];
  for (const folder of folders) {
    const dir = folder.uri.fsPath;
    if (!gitOps.isGitRepo(dir)) continue;
    try {
      return gitOps.getRepoRoot(dir);
    } catch {
      return dir;
    }
  }
  return null;
}

function setupFileWatcher(context) {
  fileWatcher?.dispose();

  const config = getConfig();
  if (!config.autoCommit || !repoRoot) {
    clearDebounce();
    return;
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
  const onFileChange = (uri) => {
    const relPath = vscode.workspace.asRelativePath(uri);
    if (shouldExclude(relPath, config.excludePatterns)) return;

    log(`Change detected: ${relPath}`);
    scheduleAutoCommit(config.debounceSeconds);
    sendTimerUpdate(timerRemaining, config.debounceSeconds);
  };

  watcher.onDidCreate(onFileChange);
  watcher.onDidChange(onFileChange);
  watcher.onDidDelete(onFileChange);

  context.subscriptions.push(watcher);
  fileWatcher = watcher;
}

function shouldExclude(relPath, patterns) {
  if (!relPath) return true;
  const normalized = relPath.replace(/\\/g, '/');
  return (patterns || []).some((pattern) => globMatch(normalized, pattern));
}

function globMatch(input, pattern) {
  if (!pattern) return false;

  const normalizedPattern = pattern.replace(/\\/g, '/');
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${escaped}$`).test(input);
}

function scheduleAutoCommit(seconds) {
  clearDebounce();
  timerRemaining = seconds;

  timerInterval = setInterval(() => {
    timerRemaining -= 0.25;
    sendTimerUpdate(timerRemaining, seconds);
    
    if (timerRemaining > 0) {
      updateStatusBar();
      return;
    }

    clearDebounce();
    runAutoCommit();
  }, 250);
}

function clearDebounce() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerRemaining = 0;
}

async function runAutoCommit() {
  if (!repoRoot || !gitOps.hasChanges(repoRoot)) return;

  const config = getConfig();
  try {
    const summary = gitOps.getChangeSummary(repoRoot);
    const diff = gitOps.getDiff(repoRoot);
    const message = await generateMessage(summary, diff, {
      style: config.commitStyle,
      useAi: config.useAi,
      googleApiKey: config.googleApiKey,
      aiModel: config.aiModel,
    });

    await gitOps.stageAll(repoRoot);
    await gitOps.commit(repoRoot, message);

    if (config.autoPush) {
      await gitOps.push(repoRoot);
      toast(`Auto-committed and pushed: ${message}`);
    } else {
      toast(`Auto-committed: ${message}`);
    }

    sendPanelState();
    updateStatusBar();
  } catch (error) {
    log(`Auto-commit failed: ${error.message}`, true);
    toast(`Auto-commit failed: ${error.message}`, true);
  }
}

async function runCommit(andPush, customMessage) {
  if (!repoRoot) {
    toast('No git repository found.', true);
    return;
  }

  try {
    const hasChanges = gitOps.hasChanges(repoRoot);
    if (!hasChanges && !andPush) {
      toast('Nothing to commit.');
      return;
    }

    let message = customMessage;
    if (!message) {
      const config = getConfig();
      if (hasChanges) {
        const summary = gitOps.getChangeSummary(repoRoot);
        const diff = gitOps.getDiff(repoRoot);
        message = await generateMessage(summary, diff, {
          style: config.commitStyle,
          useAi: config.useAi,
          googleApiKey: config.googleApiKey,
          aiModel: config.aiModel,
        });
      } else {
        message = fallbackMessage(config.commitStyle);
      }
    }

    if (hasChanges) {
      await gitOps.stageAll(repoRoot);
      await gitOps.commit(repoRoot, message);
      log(`Committed: ${message}`);
    }

    if (andPush) {
      await gitOps.push(repoRoot);
      toast(hasChanges ? `Committed and pushed: ${message}` : 'Pushed current branch.');
    } else if (hasChanges) {
      toast(`Committed: ${message}`);
    }

    clearDebounce();
    sendPanelState();
    updateStatusBar();
  } catch (error) {
    log(`Commit flow failed: ${error.message}`, true);
    toast(error.message, true);
  }
}

async function runUndo() {
  if (!repoRoot) return;

  const confirm = await vscode.window.showWarningMessage(
    'Undo the last commit? Changes will remain staged.',
    { modal: true },
    'Undo',
  );

  if (confirm !== 'Undo') return;

  try {
    await gitOps.undoLastCommit(repoRoot);
    toast('Last commit undone. Changes are staged.');
    sendPanelState();
    updateStatusBar();
  } catch (error) {
    toast(error.message, true);
  }
}

function updateStatusBar() {
  if (!statusBarItem) return;

  const config = getConfig();
  const repoExists = Boolean(repoRoot);
  const hasChanges = repoExists && gitOps.hasChanges(repoRoot);
  const branch = repoExists ? gitOps.getCurrentBranch(repoRoot) : 'no-repo';
  
  let state = 'idle';
  let icon = '$(rocket)';
  let text = 'GitPilot';
  let bgColor = undefined;
  let tooltip = 'GitPilot: Working directory is clean.';

  if (!repoExists) {
    state = 'no-repo';
    icon = '$(stop)';
    text = 'GitPilot: No Repo';
    tooltip = 'GitPilot: No Git repository detected in the current workspace.';
  } else if (timerInterval && timerRemaining > 0) {
    state = 'countdown';
    // Pulsing icon: cycle between rocket and sync
    const icons = ['$(rocket)', '$(sync~spin)', '$(rocket)', '$(sync~spin)'];
    icon = icons[Math.floor(animationTick % 4)];
    
    const progressText = getProgressBar(timerRemaining, config.debounceSeconds);
    const pulseChar = (animationTick % 2 === 0) ? '•' : ' ';
    text = `${progressText} ${Math.ceil(timerRemaining)}s ${pulseChar}`;
    
    bgColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    tooltip = `Auto-committing in ${Math.ceil(timerRemaining)}s. Click to commit now.`;
  } else if (hasChanges) {
    state = 'dirty';
    // Subtle breathing pulse for the rocket
    const isLit = (animationTick % 4 === 1 || animationTick % 4 === 2);
    icon = isLit ? '$(rocket)' : '$(rocket~spin)';
    const changeCount = gitOps.getChangeSummary(repoRoot).files.length;
    text = `GitPilot: ${changeCount} change${changeCount > 1 ? 's' : ''}`;
    tooltip = `${changeCount} uncommitted files. Auto-commit active.`;
  }

  // Handle errors (simplified for this context, could be expanded)
  // if (lastError) { ... }

  statusBarItem.text = `${icon} ${text}`;
  statusBarItem.backgroundColor = bgColor;
  statusBarItem.tooltip = tooltip;
  statusBarItem.show();
}

function getProgressBar(remaining, total) {
  const size = 8;
  const progress = Math.min(Math.max((total - remaining) / total, 0), 1) * size;
  const blocks = ['░', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  
  let res = '';
  for (let i = 0; i < size; i++) {
    const charProgress = Math.min(Math.max(progress - i, 0), 1);
    const index = Math.floor(charProgress * (blocks.length - 1));
    res += blocks[index];
  }
  return `[${res}]`;
}

function openPanel() {
  vscode.commands.executeCommand('gitpilot.panel.focus');
}

function getPanelHtml() {
  const config = getConfig();
  const fileName = config.experimentalUI ? 'panel-modern.html' : 'panel.html';
  const htmlPath = path.join(__dirname, 'ui', fileName);
  return fs.readFileSync(htmlPath, 'utf8');
}

function handleWebviewMessage(message) {
  switch (message.type) {
    case 'ready':
    case 'generateMessage':
      sendPanelState();
      break;
    case 'commit':
      runCommit(Boolean(message.andPush), message.message || null);
      break;
    case 'undo':
      runUndo();
      break;
    case 'toggleAutoCommit':
      vscode.workspace.getConfiguration('gitpilot').update('autoCommit', Boolean(message.value), true);
      break;
    case 'toggleAutoPush':
      vscode.workspace.getConfiguration('gitpilot').update('autoPush', Boolean(message.value), true);
      break;
    case 'setStyle':
      vscode.workspace.getConfiguration('gitpilot').update('commitStyle', message.value, true);
      sendPanelState();
      break;
    case 'checkout':
      if (repoRoot) {
        gitOps.checkoutBranch(repoRoot, message.branch).then(() => {
          toast(`Switched to branch: ${message.branch}`);
          sendPanelState();
        }).catch(err => toast(err.message, true));
      }
      break;
    case 'pull':
      if (repoRoot) {
        gitOps.pull(repoRoot).then(() => {
          toast('Pulled latest changes.');
          sendPanelState();
        }).catch(err => toast(err.message, true));
      }
      break;
    case 'fetch':
      if (repoRoot) {
        gitOps.fetch(repoRoot).then(() => {
          toast('Fetched updates from origin.');
          sendPanelState();
        }).catch(err => toast(err.message, true));
      }
      break;
    case 'updateSetting':
      if (message.key) {
        vscode.workspace.getConfiguration('gitpilot').update(message.key, message.value, true);
        toast(`Settings updated.`);
      }
      break;
    case 'copyHash':
      if (message.hash) vscode.env.clipboard.writeText(message.hash);
      break;
    case 'openFolder':
      vscode.commands.executeCommand('vscode.openFolder');
      break;
    default:
      break;
  }
}

async function sendPanelState() {
  if (!webviewPanel) return;

  if (!repoRoot) {
    webviewPanel.webview.postMessage({
      type: 'update',
      branch: 'no-repo',
      hasChanges: false,
      changeSummary: { added: [], modified: [], deleted: [], renamed: [], untracked: [], files: [] },
      linesAdded: 0,
      linesRemoved: 0,
      suggestedMessage: '',
      recentCommits: [],
      ahead: 0,
      behind: 0,
      remoteUrl: null,
      autoCommit: false,
      autoPush: false,
      debounceSeconds: getConfig().debounceSeconds,
      commitStyle: getConfig().commitStyle,
    });
    return;
  }

  const config = getConfig();
  const hasChanges = gitOps.hasChanges(repoRoot);
  const changeSummary = hasChanges
    ? gitOps.getChangeSummary(repoRoot)
    : { added: [], modified: [], deleted: [], renamed: [], untracked: [], files: [] };
  const diff = hasChanges ? gitOps.getDiff(repoRoot) : '';

  const linesAdded = (diff.match(/^\+[^+]/gm) || []).length;
  const linesRemoved = (diff.match(/^-[^-]/gm) || []).length;
  const suggestedMessage = hasChanges
    ? await generateMessage(changeSummary, diff, {
        style: config.commitStyle,
        useAi: config.useAi,
        googleApiKey: config.googleApiKey,
        aiModel: config.aiModel,
      })
    : '';

  const { ahead, behind } = gitOps.getAheadBehind(repoRoot);
  const branches = gitOps.getBranches(repoRoot);
  
  const payload = {
    type: 'update',
    branch: gitOps.getCurrentBranch(repoRoot),
    branches,
    hasChanges,
    changeSummary,
    linesAdded,
    linesRemoved,
    suggestedMessage,
    recentCommits: gitOps.getRecentCommits(repoRoot, 12),
    ahead,
    behind,
    remoteUrl: gitOps.getRemoteUrl(repoRoot),
    autoCommit: config.autoCommit,
    autoPush: config.autoPush,
    debounceSeconds: config.debounceSeconds,
    commitStyle: config.commitStyle,
    useAi: config.useAi,
    googleApiKey: config.googleApiKey, // Passed for the UI to show partial key/status
    aiModel: config.aiModel,
  };

  webviewPanel.webview.postMessage(payload);
}

function sendTimerUpdate(remaining, total) {
  webviewPanel?.webview.postMessage({ type: 'timerTick', remaining, total });
}

function getConfig() {
  const config = vscode.workspace.getConfiguration('gitpilot');
  return {
    autoCommit: config.get('autoCommit', false),
    autoPush: config.get('autoPush', false),
    debounceSeconds: config.get('debounceSeconds', 30),
    commitStyle: config.get('commitStyle', 'conventional'),
    excludePatterns: config.get('excludePatterns', ['*.log', 'node_modules/**', '.env']),
    experimentalUI: config.get('experimentalUI', true),
    useAi: config.get('useAi', false),
    googleApiKey: config.get('googleApiKey', ''),
    aiModel: config.get('aiModel', 'gemini-2.0-flash'),
  };
}

function toggleAutoCommit() {
  const config = vscode.workspace.getConfiguration('gitpilot');
  config.update('autoCommit', !config.get('autoCommit', false), true);
}

function toggleAutoPush() {
  const config = vscode.workspace.getConfiguration('gitpilot');
  config.update('autoPush', !config.get('autoPush', false), true);
}

function toast(message, isError = false) {
  if (isError) vscode.window.showErrorMessage(`GitPilot: ${message}`);
  else vscode.window.showInformationMessage(`GitPilot: ${message}`);

  webviewPanel?.webview.postMessage({ type: 'toast', message, isError });
}

function log(message, isError = false) {
  const time = new Date().toISOString().slice(11, 19);
  outputChannel?.appendLine(`[${time}] ${isError ? 'ERROR: ' : ''}${message}`);
}

async function checkCredentials() {
  if (!repoRoot) return;

  const remoteUrl = gitOps.getRemoteUrl(repoRoot);
  if (!remoteUrl || !remoteUrl.startsWith('https://')) return;

  const helper = gitOps.getCredentialHelper(repoRoot);
  if (!helper) {
    const response = await vscode.window.showWarningMessage(
      'GitPilot detected you are using HTTPS but no credential helper is configured. Auto-push will fail unless credentials are saved.',
      'How to fix?',
      'Ignore',
    );

    if (response === 'How to fix?') {
      const fix = await vscode.window.showInformationMessage(
        'The recommended fix is to use SSH, or configure a credential helper locally with:\ngit config --global credential.helper cache',
        'Copy command',
        'Open Git Docs',
      );

      if (fix === 'Copy command') {
        vscode.env.clipboard.writeText('git config --global credential.helper cache');
      } else if (fix === 'Open Git Docs') {
        vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/docs/git-credential-cache'));
      }
    }
  }
}

module.exports = {
  activate,
  deactivate,
};
