import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Mount Olivet Methodist Academy School Exercise & Homework Monitoring System',
    short_name: 'MOMA-SEHMS',
    description: 'Monitor class exercises, homework and submission progress.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f2f4f9',
    theme_color: '#14285f',
    lang: 'en-GH',
    dir: 'ltr',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My assignments', short_name: 'Assignments', url: '/work', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'New assignment', short_name: 'New', url: '/work/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Find a student', short_name: 'Students', url: '/find-student', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    // screenshots: add 1080x1920 (narrow) and 1920x1080 (wide) PNGs of the dashboard here before store listing.
  };
}
