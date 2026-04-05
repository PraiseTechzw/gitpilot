const { generateMessage } = require('./src/git/commitMessage');

async function test() {
  console.log('Testing World-Class Heuristics...\n');

  const scenarios = [
    {
      name: 'New Auth Component',
      summary: { files: ['src/ui/AuthButton.js'], added: ['src/ui/AuthButton.js'], modified: [], deleted: [], renamed: [] },
      diff: '+ export const AuthButton = () => { ... }',
    },
    {
      name: 'Bug Fix in API',
      summary: { files: ['src/api/users.js'], added: [], modified: ['src/api/users.js'], deleted: [], renamed: [] },
      diff: '- const user = getUser();\n+ const user = await fetchUser(); // fix race condition',
    },
    {
      name: 'Refactor Utils',
      summary: { files: ['src/utils/format.js', 'src/utils/date.js'], added: [], modified: ['src/utils/format.js', 'src/utils/date.js'], deleted: [], renamed: [] },
      diff: 'refactor formatters and date helpers',
    },
    {
      name: 'Documentation Update',
      summary: { files: ['README.md'], added: [], modified: ['README.md'], deleted: [], renamed: [] },
      diff: 'update installation instructions',
    }
  ];

  for (const scenario of scenarios) {
    const msg = await generateMessage(scenario.summary, scenario.diff, { style: 'conventional' });
    console.log(`[${scenario.name}]`);
    console.log(`  Result: ${msg}`);
  }

  console.log('\nTesting Fallback logic (No AI Key)...');
  const fallbackMsg = await generateMessage(scenarios[0].summary, scenarios[0].diff, { useAi: true });
  console.log(`  Result: ${fallbackMsg}`);
}

test().catch(console.error);
