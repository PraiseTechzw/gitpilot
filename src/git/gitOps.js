const { execFileSync, execFile } = require('child_process');

function runGit(args, cwd) {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trimEnd();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    throw new Error(stderr || error.message);
  }
}

function runGitAsync(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || '').trim() || error.message));
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
  undoLastCommit,
  getRecentCommits,
  getRemoteUrl,
  getAheadBehind,
};
