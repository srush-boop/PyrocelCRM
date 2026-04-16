import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fire Testing CRM',
  description: 'Starter CRM for fire alarm and emergency lighting testing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
