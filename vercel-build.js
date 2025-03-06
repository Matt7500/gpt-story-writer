// This script runs before the build on Vercel
import fs from 'fs';
import path from 'path';

// Ensure the dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Copy all files from public to dist
if (fs.existsSync('public')) {
  const publicFiles = fs.readdirSync('public');
  
  publicFiles.forEach(file => {
    const sourcePath = path.join('public', file);
    const destPath = path.join('dist', file);
    
    if (fs.statSync(sourcePath).isFile()) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${sourcePath} to ${destPath}`);
    }
  });
}

console.log('Vercel build preparation complete'); 