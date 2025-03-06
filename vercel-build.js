// This script runs before the build on Vercel
import fs from 'fs';
import path from 'path';

// Ensure the dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Copy the _headers file to the dist directory
if (fs.existsSync('public/_headers')) {
  fs.copyFileSync('public/_headers', 'dist/_headers');
}

// Copy the _redirects file to the dist directory
if (fs.existsSync('public/_redirects')) {
  fs.copyFileSync('public/_redirects', 'dist/_redirects');
}

console.log('Vercel build preparation complete'); 