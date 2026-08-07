import './globals.css';
import { Inter } from 'next/font/google';
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Enterprise AI Workflow Platform',
  description: 'AI Customer Support & Workflow Builder',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body>
        <AuthGuard>
          <div className="flex min-h-screen bg-background text-on-surface">
            <Sidebar />
            <div className="flex-1 md:ml-64 pt-16 md:pt-0 min-h-screen">
              {children}
            </div>
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}
