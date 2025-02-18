// Determine if we're in development mode
const isDevelopment = window.location.hostname === 'localhost';

// Use local server in development, production server otherwise
export const API_URL = isDevelopment 
  ? 'http://localhost:3001'
  : (import.meta.env.VITE_API_URL || 'https://plotter-palette-server.onrender.com'); 