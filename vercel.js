// This file helps ensure proper MIME types for Vercel deployments
export default {
  version: 2,
  routes: [
    {
      handle: 'filesystem',
    },
    {
      src: '/assets/(.*)',
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
      continue: true,
    },
    {
      src: '/(.*)\\.js',
      headers: {
        'content-type': 'application/javascript',
      },
      continue: true,
    },
    {
      src: '/(.*)\\.css',
      headers: {
        'content-type': 'text/css',
      },
      continue: true,
    },
    {
      src: '/(.*)',
      dest: '/index.html',
    },
  ],
}; 