export default function manifest() {
  return {
    name: 'Moroccan Booking OS',
    short_name: 'Moroccan OS',
    description: 'Multi-centre spa booking and financial operations system',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1322',
    theme_color: '#0b1322',
    orientation: 'any',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }
}
