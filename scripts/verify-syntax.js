import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let errors = 0;
let checked = 0;

function checkDir(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '.git') {
      checkDir(full);
    } else if (f.isFile() && (f.name.endsWith('.js') || f.name.endsWith('.mjs') || f.name.endsWith('.cjs'))) {
      checked++;
      try {
        execSync(`node --check "${full}"`);
      } catch (err) {
        console.error(`❌ Syntax Error in ${full}:\n`, err.stderr?.toString() || err.message);
        errors++;
      }
    }
  }
}

console.log('Checking server and root JS files...');
checkDir('./server');
checkDir('.');
console.log(`Checked ${checked} files. Total syntax errors: ${errors}`);
