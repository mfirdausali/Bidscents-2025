// A simple script to run the seed-db.ts file using tsx
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const seedPath = join(__dirname, 'seed-db.ts');

console.log('Running database seed script...');

const child = exec(`npx tsx ${seedPath}`, (error, stdout, stderr) => {
  if (error) {
    console.error(`Execution error: ${error}`);
    return;
  }
  
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});

child.stdout.on('data', (data) => {
  console.log(`${data}`);
});

child.stderr.on('data', (data) => {
  console.error(`${data}`);
});