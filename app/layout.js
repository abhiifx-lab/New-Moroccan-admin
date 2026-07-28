import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'Aurea Spa — ERP',
  description: 'Multi-centre luxury spa business operating system',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
