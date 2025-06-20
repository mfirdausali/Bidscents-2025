// A script to set up the database schema and run the seed script
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Setting up database...');

// First, run drizzle-kit to push schema to the database
console.log('1. Running drizzle-kit to push schema...');
exec('npx drizzle-kit push', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error running drizzle-kit: ${error}`);
    return;
  }
  
  console.log(`drizzle-kit output: ${stdout}`);
  
  if (stderr) {
    console.error(`drizzle-kit stderr: ${stderr}`);
  }
  
  // After schema is pushed, run the seed script
  console.log('2. Running seed script...');
  const seedScript = join(__dirname, 'run-seed.js');
  
  exec(`node ${seedScript}`, (seedError, seedStdout, seedStderr) => {
    if (seedError) {
      console.error(`Error running seed script: ${seedError}`);
      return;
    }
    
    console.log(`Seed script output: ${seedStdout}`);
    
    if (seedStderr) {
      console.error(`Seed script stderr: ${seedStderr}`);
    }
    
    console.log('Database setup completed!');
  });
});