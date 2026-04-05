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

  // Find the deepest common directory
  const paths = files.map((f) => f.split('/'));
  let common = [];
  for (let i = 0; i < paths[0].length; i++) {
    const part = paths[0][i];
    if (paths.every((p) => p[i] === part)) {
      common.push(part);
    } else {
      break;
    }
  }

  // Remove generic prefixes like 'src', 'app', 'lib'
  const filtered = common.filter((p) => !['src', 'app', 'lib', 'packages', 'client', 'server'].includes(p.toLowerCase()));
  if (filtered.length > 0) return filtered[filtered.length - 1];

  if (files.length === 1) {
    const dir = path.dirname(files[0]);
    if (dir !== '.') {
      const parts = dir.split('/');
      const last = parts[parts.length - 1];
      if (!['src', 'app', 'lib'].includes(last.toLowerCase())) return last;
    }
  }

  // Fallback to the most frequent top-level dir if no deep common dir
  const topLevel = files.map((file) => file.split('/')[0]).filter(Boolean);
  const counts = {};
  for (const item of topLevel) counts[item] = (counts[item] || 0) + 1;
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  
  return winner ? winner[0] : null;
}

function detectType(summary, diffText) {
  if (summary.added.length > 0 && summary.modified.length === 0) return 'feat';
  if (summary.deleted.length > 0 && summary.added.length === 0 && summary.modified.length === 0) return 'chore';

  for (const file of summary.files) {
    for (const { pattern, type } of PATH_TYPE_MAP) {
      if (pattern.test(file)) return type;
    }
  }

  const diffLower = (diffText || '').toLowerCase().slice(0, 3000);
  if (BUG_PATTERNS.some((pattern) => pattern.test(diffLower))) return 'fix';
  if (FEATURE_PATTERNS.some((pattern) => pattern.test(diffLower))) return 'feat';
  if (REFACTOR_PATTERNS.some((pattern) => pattern.test(diffLower))) return 'refactor';

  const extCounts = {};
  for (const file of summary.files) {
    const ext = path.extname(file).replace('.', '').toLowerCase();
    if (EXT_TYPE_MAP[ext]) {
      extCounts[EXT_TYPE_MAP[ext]] = (extCounts[EXT_TYPE_MAP[ext]] || 0) + 1;
    }
  }

  const addedLines = ((diffText || '').match(/^\+[^+]/gm) || []).length;
  const removedLines = ((diffText || '').match(/^-[^-]/gm) || []).length;

  if (summary.renamed.length > 0 && summary.modified.length === 0) return 'refactor';
  if (addedLines > 60 && removedLines < 10) return 'feat';
  if (removedLines > addedLines * 2) return 'refactor';

  return Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'chore';
}

function extractKeywords(diffText) {
  const keywords = new Set();
  
  // Find added/exported functions or classes
  const functionRegex = /^\+\s*(?:export\s+)?(?:async\s+)?(?:function|const|class)\s+([a-zA-Z0-9_$]+)/gm;
  let match;
  while ((match = functionRegex.exec(diffText)) !== null) {
    if (match[1] && match[1].length > 2) keywords.add(match[1]);
  }

  // Find significant identifiers in modified lines
  if (keywords.size < 2) {
    const importantWords = [/login/i, /auth/i, /user/i, /pay/i, /cart/i, /api/i, /ui/i, /style/i, /fix/i, /bug/i];
    for (const pattern of importantWords) {
      if (pattern.test(diffText)) {
        const found = diffText.match(pattern);
        if (found) keywords.add(found[0].toLowerCase());
      }
    }
  }

  return Array.from(keywords).slice(0, 3);
}

function buildSubject(summary, diffText) {
  const { files, added, modified, deleted, renamed } = summary;
  if (!files.length) return 'update files';

  const keywords = extractKeywords(diffText || '');
  const type = detectType(summary, diffText);

  let verb = 'update';
  if (type === 'feat') verb = 'add';
  if (type === 'fix') verb = 'fix';
  if (type === 'refactor') verb = 'refactor';
  if (type === 'docs') verb = 'update documentation for';
  if (type === 'style') verb = 'polish';
  if (type === 'test') verb = 'ensure';

  if (keywords.length > 0) {
    const keywordStr = keywords.join(', ');
    if (type === 'feat') return `implement ${keywordStr}`;
    if (type === 'fix') return `resolve issues in ${keywordStr}`;
    return `${verb} ${keywordStr}`;
  }

  if (files.length === 1) {
    const fileName = path.basename(files[0]);
    const nameOnly = fileName.split('.')[0];
    if (added.length) return `add ${nameOnly}`;
    if (deleted.length) return `remove ${nameOnly}`;
    if (renamed.length) return `rename ${nameOnly}`;
    return `update ${nameOnly}`;
  }

  const parts = [];
  if (added.length) parts.push(`add ${added.length} component${added.length > 1 ? 's' : ''}`);
  if (modified.length) parts.push(`update logic in ${modified.length} file${modified.length > 1 ? 's' : ''}`);
  if (deleted.length) parts.push(`cleanup ${deleted.length} file${deleted.length > 1 ? 's' : ''}`);

  return parts.slice(0, 2).join(' and ');
}

async function generateAiMessage(diffText, summary, options) {
  const { apiKey, model = 'gemini-2.0-flash' } = options;
  if (!apiKey) return null;

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const aiModel = genAI.getGenerativeModel({ model });

    const prompt = `
Generate a professional "Conventional Commit" message for the following git diff.
Follow the format: <type>(<scope>): <subject>

Rules:
1. Type must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
2. Scope should be the module or feature area (e.g., auth, ui, api).
3. Subject must be in imperative mood ("add", not "added"), descriptive, and under 72 chars.
4. Output ONLY the commit message string, nothing else.

Summary of changes:
${JSON.stringify(summary, null, 2)}

Diff:
${diffText.slice(0, 10000)}
    `;

    const result = await aiModel.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim().replace(/^`+|`+$/g, '');
    
    // Validate format roughly
    if (/^[a-z]+(\(.*\))?: .*/.test(text)) {
      return text;
    }
    return null;
  } catch (error) {
    console.error('AI Commit Generation Error:', error);
    return null;
  }
}

async function generateMessage(summary, diffText, options = {}) {
  const { style = 'conventional', useAi = false, googleApiKey = null } = options;

  if (useAi && googleApiKey) {
    const aiMsg = await generateAiMessage(diffText || '', summary, { apiKey: googleApiKey, model: options.aiModel });
    if (aiMsg) return aiMsg;
  }

  // Fallback to Heuristics
  const type = detectType(summary, diffText || '');
  const scope = detectScope(summary.files || []);
  const subject = buildSubject(summary, diffText || '');

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
