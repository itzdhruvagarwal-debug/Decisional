const { execSync } = require('child_process');
const output = execSync('git show HEAD:src/lib/fraud-detection.ts', { encoding: 'utf8' });
const lines = output.split('\n');
console.log(lines.slice(458, 473).join('\n'));
