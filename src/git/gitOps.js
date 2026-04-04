const { execFileSync, execFile } = require('child_process');

function handleError(error) {
  const stderr = error.stderr?.toString().trim() || '';
  const message = (stderr || error.message).toLowerCase();

  if (message.includes('could not read username') || message.includes('no such device or address')) {
    throw new Error(
      'Authentication failed. GitPilot cannot prompt for credentials in the background.\n\n' +
      'To fix this, please:\n' +
      '1. Use SSH instead of HTTPS for your remote URL.\n' +
      '2. OR configure a credential helper: git config --global credential.helper cache\n' +
      '3. OR (CLI only) run: gitpilot push'
    );
  }

  throw new Error(stderr || error.message);
}

function runGit(args, cwd) {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trimEnd();
  } catch (error) {
    handleError(error);
  }
}

function runGitAsync(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        try {
          handleError({ ...error, stderr });
        } catch (wrappedError) {
          reject(wrappedError);
        }
        return;
      }
      resolve((stdout || '').trimEnd());
    });
  });
}

function isGitRepo(dir) {
  try {
    runGit(['rev-parse', '--git-dir'], dir);
    return true;
  } catch {
    return false;
  }
}

function getRepoRoot(dir) {
  return runGit(['rev-parse', '--show-toplevel'], dir);
}

function getCurrentBranch(repoRoot) {
  try {
    return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  } catch {
    return 'unknown';
  }
}

function hasChanges(repoRoot) {
  return runGit(['status', '--porcelain'], repoRoot).length > 0;
}

function getDiff(repoRoot) {
  const staged = runGit(['diff', '--cached'], repoRoot);
  const unstaged = runGit(['diff'], repoRoot);
  return `${staged}\n${unstaged}`.trim();
}

function getChangeSummary(repoRoot) {
  const status = runGit(['status', '--porcelain'], repoRoot);
  const lines = status.split('\n').filter(Boolean);
  const summary = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
    untracked: [],
    files: [],
  };

  for (const line of lines) {
    const xy = line.slice(0, 2);
    const file = line.slice(3).trim().split(' -> ').pop();
    summary.files.push(file);

    if (xy === '??' || xy.includes('A')) summary.added.push(file);
    else if (xy.includes('D')) summary.deleted.push(file);
    else if (xy.includes('R')) summary.renamed.push(file);
    else summary.modified.push(file);
  }

  return summary;
}

async function stageAll(repoRoot) {
  await runGitAsync(['add', '-A'], repoRoot);
}

async function commit(repoRoot, message) {
  await runGitAsync(['commit', '-m', message], repoRoot);
}

async function push(repoRoot) {
  const branch = getCurrentBranch(repoRoot);
  try {
    await runGitAsync(['push', 'origin', branch], repoRoot);
  } catch (error) {
    if (error.message.includes('no upstream branch')) {
      await runGitAsync(['push', '--set-upstream', 'origin', branch], repoRoot);
      return;
    }
    throw error;
  }
}

/**
 * Runs a push with inherited stdio, allowing the user to interact with
 * git's credential prompts. Used by the CLI.
 */
function pushInteractive(repoRoot) {
  const branch = getCurrentBranch(repoRoot);
  try {
    // We use spawnSync here because we want to inherit stdio (stdin, stdout, stderr)
    // so the user can see and respond to prompts like "Username for 'https://github.com':"
    const { spawnSync } = require('child_process');
    const result = spawnSync('git', ['push', 'origin', branch], {
      cwd: repoRoot,
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      if (result.error) throw result.error;
      // If result.status is non-zero but there's no result.error, it's a git error
      // that already printed to stderr. We throw a generic error to stop the flow.
      throw new Error('Git push failed.');
    }
  } catch (error) {
    if (error.message.includes('no upstream branch')) {
      const { spawnSync } = require('child_process');
      spawnSync('git', ['push', '--set-upstream', 'origin', branch], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
      return;
    }
    throw error;
  }
}

async function undoLastCommit(repoRoot) {
  await runGitAsync(['reset', '--soft', 'HEAD~1'], repoRoot);
}

function getRecentCommits(repoRoot, n = 8) {
  try {
    const log = runGit(
      ['log', `-${n}`, '--pretty=format:%H|%s|%cr|%an', '--no-merges'],
      repoRoot,
    );

    return log.split('\n').filter(Boolean).map((line) => {
      const [hash, message, date, author] = line.split('|');
      return { hash: hash.slice(0, 7), message, date, author };
    });
  } catch {
    return [];
  }
}

function getRemoteUrl(repoRoot) {
  try {
    return runGit(['remote', 'get-url', 'origin'], repoRoot);
  } catch {
    return null;
  }
}

function getAheadBehind(repoRoot) {
  try {
    const value = runGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], repoRoot);
    const [behind, ahead] = value.split('\t').map(Number);
    return { ahead, behind };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

function getCredentialHelper(repoRoot) {
  try {
    return runGit(['config', '--get', 'credential.helper'], repoRoot);
  } catch {
    return null;
  }
}

module.exports = {
  runGit,
  runGitAsync,
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  hasChanges,
  getDiff,
  getChangeSummary,
  stageAll,
  commit,
  push,
  pushInteractive,
  undoLastCommit,
  getRecentCommits,
  getRemoteUrl,
  getAheadBehind,
  getCredentialHelper,
};
