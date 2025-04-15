// Script to update the main application files to use Supabase
import fs from 'fs';
import path from 'path';

// Main function to update the files
async function updateToSupabase() {
  console.log('Updating application to use Supabase...');
  
  try {
    // 1. Update the server/routes.ts file to use supabase-storage.ts instead of object-storage.ts
    console.log('Updating server/routes.ts...');
    const routesPath = path.join(process.cwd(), 'server', 'routes.ts');
    let routesContent = fs.readFileSync(routesPath, 'utf8');
    
    // Replace import statements
    routesContent = routesContent.replace(
      "import * as objectStorage from './object-storage';",
      "import * as objectStorage from './supabase-storage';"
    );
    
    // Write back the updated content
    fs.writeFileSync(routesPath, routesContent);
    console.log('Updated server/routes.ts');
    
    // 2. Update the server/index.ts file to initialize Supabase
    console.log('Updating server/index.ts...');
    const indexPath = path.join(process.cwd(), 'server', 'index.ts');
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Find the import section
    const importSectionEnd = indexContent.indexOf('const app = express()');
    const importSection = indexContent.substring(0, importSectionEnd);
    const restOfContent = indexContent.substring(importSectionEnd);
    
    // Add Supabase import
    let updatedImportSection = importSection;
    if (!updatedImportSection.includes('import { ensureBucketExists } from ')) {
      updatedImportSection += "import { ensureBucketExists } from './supabase-storage';\n";
    }
    
    // Update server initialization
    let updatedRestOfContent = restOfContent;
    
    // Find a good spot to initialize the Supabase bucket
    const serverStartIndex = updatedRestOfContent.indexOf('app.listen(');
    if (serverStartIndex !== -1) {
      const beforeServerStart = updatedRestOfContent.substring(0, serverStartIndex);
      const afterServerStart = updatedRestOfContent.substring(serverStartIndex);
      
      // Add bucket initialization
      updatedRestOfContent = beforeServerStart + 
        `// Initialize Supabase storage bucket
ensureBucketExists().then(success => {
  if (success) {
    console.log('Supabase storage bucket initialized');
  } else {
    console.error('Failed to initialize Supabase storage bucket');
  }
});

` + afterServerStart;
    }
    
    // Write back the updated content
    fs.writeFileSync(indexPath, updatedImportSection + updatedRestOfContent);
    console.log('Updated server/index.ts');
    
    // 3. Update the server/storage.ts file to use Supabase for user images if needed
    console.log('Updating server/storage.ts...');
    const storagePath = path.join(process.cwd(), 'server', 'storage.ts');
    let storageContent = fs.readFileSync(storagePath, 'utf8');
    
    // Replace import statements for object storage
    if (storageContent.includes("const objectStorage = await import('./object-storage')")) {
      storageContent = storageContent.replace(
        "const objectStorage = await import('./object-storage')",
        "const objectStorage = await import('./supabase-storage')"
      );
      
      // Write back the updated content
      fs.writeFileSync(storagePath, storageContent);
      console.log('Updated server/storage.ts');
    } else {
      console.log('No changes needed in server/storage.ts');
    }
    
    console.log('Application updated to use Supabase successfully!');
    console.log('\nNext steps:');
    console.log('1. Set up tables in Supabase using the SQL from setup-supabase.js');
    console.log('2. Restart the application to use Supabase for storage');
    console.log('3. Migrate data from your current database to Supabase');
  } catch (error) {
    console.error('Error updating to Supabase:', error);
  }
}

// Run the update
updateToSupabase();