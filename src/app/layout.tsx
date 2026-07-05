import type { Metadata } from 'next'
import '@/styles/globals.css'
import { AppShell } from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'Tadbeer Accounting',
  description: 'Smart accounting for SMEs — powered by Tadbeer Transformations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
