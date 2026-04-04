const path = require('path');

const EXT_TYPE_MAP = {
  spec: 'test',
  test: 'test',
  css: 'style',
  scss: 'style',
  sass: 'style',
  less: 'style',
  md: 'docs',
  mdx: 'docs',
  rst: 'docs',
  txt: 'docs',
  json: 'chore',
  yaml: 'chore',
  yml: 'chore',
  toml: 'chore',
  lock: 'chore',
  env: 'chore',
  dockerfile: 'build',
};

const PATH_TYPE_MAP = [
  { pattern: /\.(test|spec)\.[jt]sx?$/i, type: 'test' },
  { pattern: /\/__tests__\//i, type: 'test' },
  { pattern: /\/docs?\//i, type: 'docs' },
  { pattern: /\/(readme|changelog|license)/i, type: 'docs' },
  { pattern: /\/(scripts?|build|dist|release)\//i, type: 'build' },
  { pattern: /\/(\.github|\.gitlab|ci)\//i, type: 'ci' },
];

const BUG_PATTERNS = [/fix(ed|ing)?/i, /bug/i, /error/i, /crash/i, /issue/i, /exception/i];
const FEATURE_PATTERNS = [/add(ed|ing)?/i, /creat(e|ed|ing)/i, /implement/i, /new/i, /introduce/i];
const REFACTOR_PATTERNS = [/refactor/i, /restructur/i, /reorganiz/i, /clean(up)?/i, /simplif/i, /rename/i];

const EMOJI_MAP = {
  feat: '✨',
  fix: '🐛',
  docs: '📝',
  style: '💄',
  refactor: '♻️',
  test: '✅',
  chore: '🔧',
  build: '📦',
  ci: '🤖',
};

function detectScope(files) {
  if (!files.length) return null;
  const topLevel = files.map((file) => file.split('/')[0]).filter(Boolean);
  if (!topLevel.length) return null;

  const counts = {};
  for (const item of topLevel) counts[item] = (counts[item] || 0) + 1;
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return winner ? winner[0] : null;
}

function detectType(summary, diffText) {
  for (const file of summary.files) {
    for (const { pattern, type } of PATH_TYPE_MAP) {
      if (pattern.test(file)) return type;
    }
  }

  const extCounts = {};
  for (const file of summary.files) {
    const ext = path.extname(file).replace('.', '').toLowerCase();
    if (EXT_TYPE_MAP[ext]) {
      extCounts[EXT_TYPE_MAP[ext]] = (extCounts[EXT_TYPE_MAP[ext]] || 0) + 1;
    }
  }

  const diffLower = (diffText || '').toLowerCase().slice(0, 3000);
  const addedLines = ((diffText || '').match(/^\+[^+]/gm) || []).length;
  const removedLines = ((diffText || '').match(/^-[^-]/gm) || []).length;

  if (BUG_PATTERNS.some((pattern) => pattern.test(diffLower))) return 'fix';
  if (REFACTOR_PATTERNS.some((pattern) => pattern.test(diffLower)) && addedLines < removedLines * 1.5) {
    return 'refactor';
  }
  if (FEATURE_PATTERNS.some((pattern) => pattern.test(diffLower))) return 'feat';

  if (summary.renamed.length > 0 && summary.modified.length === 0) return 'refactor';
  if (addedLines > 60 && removedLines < 10) return 'feat';
  if (removedLines > addedLines * 2) return 'refactor';

  return Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'chore';
}

function buildSubject(summary) {
  const { files, added, modified, deleted, renamed } = summary;
  if (!files.length) return 'update files';

  if (files.length === 1) {
    const fileName = path.basename(files[0]);
    if (added.length) return `add ${fileName}`;
    if (deleted.length) return `remove ${fileName}`;
    if (renamed.length) return `rename ${fileName}`;
    return `update ${fileName}`;
  }

  const parts = [];
  if (added.length) parts.push(`add ${added.length} file${added.length > 1 ? 's' : ''}`);
  if (modified.length) parts.push(`update ${modified.length} file${modified.length > 1 ? 's' : ''}`);
  if (deleted.length) parts.push(`remove ${deleted.length} file${deleted.length > 1 ? 's' : ''}`);
  if (renamed.length) parts.push(`rename ${renamed.length} file${renamed.length > 1 ? 's' : ''}`);

  return parts.join(', ');
}

function generateMessage(summary, diffText, style = 'conventional') {
  const type = detectType(summary, diffText || '');
  const scope = detectScope(summary.files || []);
  const subject = buildSubject(summary);

  if (style === 'emoji') {
    const emoji = EMOJI_MAP[type] || '🔨';
    const scopePart = scope ? `[${scope}] ` : '';
    return `${emoji} ${scopePart}${subject}`;
  }

  if (style === 'simple') {
    return subject.charAt(0).toUpperCase() + subject.slice(1);
  }

  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${subject}`;
}

function fallbackMessage(style = 'conventional') {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  if (style === 'emoji') return `🔨 auto-commit ${timestamp}`;
  if (style === 'simple') return `Auto-commit ${timestamp}`;
  return `chore: auto-commit ${timestamp}`;
}

module.exports = {
  generateMessage,
  fallbackMessage,
};
