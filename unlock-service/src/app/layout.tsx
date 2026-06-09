import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Nexus Unlock'

export const metadata: Metadata = {
  title: { default: appName, template: `%s | ${appName}` },
  description: 'Professional phone carrier unlock service for consumers and repair shops.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
