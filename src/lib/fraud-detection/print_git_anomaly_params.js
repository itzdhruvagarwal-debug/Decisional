const { execSync } = require('child_process');
const output = execSync('git show HEAD:src/lib/fraud-detection.ts', { encoding: 'utf8' });
const lines = output.split('\n');

lines.forEach((line, idx) => {
  if (idx >= 945 && idx < 965) {
    console.log(`Line ${idx + 1}: ${line}`);
  }
});
