#!/usr/bin/env node

const readline = require('readline');

const gitOps = require('../src/git/gitOps');
const { generateMessage } = require('../src/git/commitMessage');

function color(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

const styles = {
  bold: (text) => color(1, text),
  red: (text) => color(31, text),
  green: (text) => color(32, text),
  yellow: (text) => color(33, text),
  cyan: (text) => color(36, text),
  gray: (text) => color(90, text),
};

function getRepoRootOrExit() {
  try {
    return gitOps.getRepoRoot(process.cwd());
  } catch {
    console.error(styles.red('Not inside a git repository.'));
    process.exit(1);
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printHelp() {
  console.log(`
${styles.bold('GitPilot CLI')}

Commands:
  commit [-y] [-m message] [-s conventional|simple|emoji] [--ai]
  push [-s conventional|simple|emoji]
  status
  log [n]
  undo
`);
}

async function commitCommand({ yes = false, message = null, style = 'conventional' }) {
  const repoRoot = getRepoRootOrExit();

  if (!gitOps.hasChanges(repoRoot)) {
    console.log(styles.yellow('Nothing to commit.'));
    return;
  }

  const summary = gitOps.getChangeSummary(repoRoot);
  const diff = gitOps.getDiff(repoRoot);
  const useAi = Boolean(flags.ai) || !!process.env.GOOGLE_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY || null;

  let finalMessage = message || await generateMessage(summary, diff, {
    style,
    useAi,
    googleApiKey,
    aiModel: flags.model || 'gemini-2.0-flash',
  });

  if (!yes && !message) {
    console.log(`${styles.bold('Suggested message:')} ${styles.green(finalMessage)}`);
    const response = await prompt('Commit with this message? [Y/n/edit] ');
    if (response.toLowerCase() === 'n') return;
    if (response.toLowerCase() === 'edit' || response.toLowerCase() === 'e') {
      finalMessage = await prompt('Enter commit message: ');
    }
  }

  await gitOps.stageAll(repoRoot);
  await gitOps.commit(repoRoot, finalMessage);
  console.log(`${styles.green('Committed:')} ${finalMessage}`);
}

async function pushCommand({ style = 'conventional' }) {
  const repoRoot = getRepoRootOrExit();
  if (gitOps.hasChanges(repoRoot)) {
    await commitCommand({ yes: true, style });
  }
  gitOps.pushInteractive(repoRoot);
  console.log(styles.green('Pushed to remote.'));
}

function statusCommand() {
  const repoRoot = getRepoRootOrExit();
  const branch = gitOps.getCurrentBranch(repoRoot);
  const { ahead, behind } = gitOps.getAheadBehind(repoRoot);
  const remote = gitOps.getRemoteUrl(repoRoot);
  const summary = gitOps.getChangeSummary(repoRoot);

  console.log(`\n${styles.bold('Branch:')} ${styles.cyan(branch)}`);
  console.log(`${styles.bold('Remote:')} ${remote || styles.gray('none')}`);
  console.log(`${styles.bold('Ahead/Behind:')} ${ahead}/${behind}`);

  if (!summary.files.length) {
    console.log(styles.green('Working tree is clean.'));
    return;
  }

  console.log(styles.bold('\nChanges:'));
  for (const file of summary.files) {
    let marker = 'M';
    if (summary.added.includes(file) || summary.untracked.includes(file)) marker = 'A';
    if (summary.deleted.includes(file)) marker = 'D';
    if (summary.renamed.includes(file)) marker = 'R';
    console.log(`  ${marker} ${file}`);
  }
}

function logCommand(count = 10) {
  const repoRoot = getRepoRootOrExit();
  const commits = gitOps.getRecentCommits(repoRoot, count);

  if (!commits.length) {
    console.log(styles.gray('No commits found.'));
    return;
  }

  for (const commit of commits) {
    console.log(`${styles.cyan(commit.hash)} ${styles.bold(commit.message)}`);
    console.log(`       ${styles.gray(`${commit.author} · ${commit.date}`)}`);
  }
}

async function undoCommand() {
  const repoRoot = getRepoRootOrExit();
  const response = await prompt('Undo last commit? Changes stay staged. [y/N] ');
  if (response.toLowerCase() !== 'y') return;

  await gitOps.undoLastCommit(repoRoot);
  console.log(styles.green('Last commit undone.'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : true;
      flags[key] = value;
      continue;
    }

    if (token.startsWith('-')) {
      const key = token.slice(1);
      const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : true;
      flags[key] = value;
      continue;
    }

    positional.push(token);
  }

  return { command, flags, positional };
}

async function main() {
  const { command, flags, positional } = parseArgs(process.argv);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case 'commit':
        await commitCommand({
          yes: Boolean(flags.y),
          message: flags.m || flags.message || null,
          style: flags.s || flags.style || 'conventional',
        });
        break;
      case 'push':
        await pushCommand({ style: flags.s || flags.style || 'conventional' });
        break;
      case 'status':
        statusCommand();
        break;
      case 'log':
        logCommand(Number(positional[0] || flags.n || 10));
        break;
      case 'undo':
        await undoCommand();
        break;
      default:
        printHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(styles.red(error.message));
    process.exitCode = 1;
  }
}

main();
