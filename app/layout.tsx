import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Impact - Master your art',
  description: 'Song writing platform with YouTube beat integration and bar categorization.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
