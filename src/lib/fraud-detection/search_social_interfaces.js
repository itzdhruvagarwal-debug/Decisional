const { execSync } = require('child_process');
const output = execSync('git show HEAD:src/lib/fraud-detection.ts', { encoding: 'utf8' });
const lines = output.split('\n');

const targets = ['PostVerificationParams', 'VerifiedPostData'];
targets.forEach(t => {
  lines.forEach((line, idx) => {
    if (line.includes(t)) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
});
