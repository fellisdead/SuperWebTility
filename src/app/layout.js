import './globals.css';
import { Inter } from 'next/font/google';
import { LanguageProvider } from '@/context/LanguageContext';
import Header from '@/components/Header';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900']
});

export const metadata = {
  title: 'SuperWebTility - Professional Web Tools',
  description: 'The simplest way to prepare your images. Crop, resize, compress, and convert instantly.',
  icons: {
    icon: [
      { url: '/favicon-light.svg', media: '(prefers-color-scheme: light)' },
      { url: '/favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
    ],
  },
  other: {
    'format-detection': 'telephone=no',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col items-center antialiased`}>
        <LanguageProvider>
          <Header />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
