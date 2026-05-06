'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Moon, Sun, Globe, Star } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const safeGet = (key) => {
  try { return localStorage.getItem(key); } catch (_) { return null; }
};

export default function Header() {
  const [dark, setDark] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { lang, changeLang, t } = useLanguage();

  useEffect(() => {
    try {
      if (safeGet('theme') === 'dark' || (!safeGet('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setDark(true);
        document.documentElement.classList.add('dark');
      }
    } catch (_) {}
  }, []);

  const toggleTheme = () => {
    const isDark = !dark;
    setDark(isDark);
    try {
      if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    } catch (_) {}
  };

  return (
    <header className="w-full max-w-[1200px] py-4 sm:py-8 px-4 sm:px-8 flex justify-between items-center mx-auto">
      <Link href="/" className="flex items-center gap-2 sm:gap-3 no-underline group flex-shrink-0">
        <div className="bg-white dark:bg-slate-800 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm tracking-tighter soft-shadow transition-all duration-300 group-hover:scale-110">
          <span className="gradient-text">SW</span>
        </div>
        <span className="hidden sm:inline text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors">{t.heroTitle}</span>
      </Link>
      
      <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
        <div className="relative">
          <button 
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1.5 sm:gap-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-3 sm:px-4 py-2 rounded-full font-bold text-xs sm:text-sm soft-shadow hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
          >
            <Globe className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{lang}</span>
            <svg className={`w-3 h-3 opacity-50 transition-transform ${langOpen ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          
          {langOpen && (
            <div className="absolute right-0 mt-3 w-32 bg-white dark:bg-slate-800 rounded-2xl soft-shadow py-2 border border-gray-100 dark:border-slate-700 z-[60]">
              {['EN', 'ES', 'JA'].map((l) => (
                <button 
                  key={l}
                  onClick={() => { changeLang(l); setLangOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {l === 'EN' ? 'English' : l === 'ES' ? 'Español' : '日本語'}
                </button>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white bg-gray-100 dark:bg-slate-800 soft-shadow transition-all flex-shrink-0"
        >
          {dark ? <Sun className="w-5 h-5" strokeWidth={1.5} /> : <Moon className="w-5 h-5" strokeWidth={1.5} />}
        </button>

        <button className="premium-btn text-white px-3 sm:px-8 py-2 sm:py-3 rounded-full text-sm sm:text-base font-bold shadow-xl flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-current" strokeWidth={1.5} />
          <span className="hidden sm:inline">{t.btnPremium}</span>
        </button>
      </div>
    </header>
  );
}
