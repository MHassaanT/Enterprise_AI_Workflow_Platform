import './globals.css';
import { Inter } from 'next/font/google';
import AuthGuard from './components/AuthGuard';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Enterprise AI Workflow Platform',
  description: 'AI Customer Support & Workflow Builder',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
