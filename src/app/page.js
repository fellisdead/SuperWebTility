'use client';

import Link from 'next/link';
import { RefreshCcw, UserMinus, Minimize2, Crop, Maximize2, TrendingUp, ScanEye, Stamp, FileCode, FileImage } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function Home() {
  const { t } = useLanguage();

  const tools = [
    { 
      id: 1, 
      title: t.cardTitle1, 
      desc: t.cardDesc1, 
      icon: <RefreshCcw className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/converter' 
    },
    { 
      id: 7, 
      title: t.cardTitle7, 
      desc: t.cardDesc7, 
      icon: <Minimize2 className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/compress' 
    },
    { 
      id: 8, 
      title: t.cardTitle8, 
      desc: t.cardDesc8, 
      icon: <Crop className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/crop' 
    },
    { 
      id: 9, 
      title: t.cardTitle9, 
      desc: t.cardDesc9, 
      icon: <Maximize2 className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/resize' 
    },
    { 
      id: 10, 
      title: t.cardTitle10, 
      desc: t.cardDesc10, 
      icon: <TrendingUp className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/upscale' 
    },
    { 
      id: 4, 
      title: t.cardTitle4, 
      desc: t.cardDesc4, 
      icon: <UserMinus className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/removebg' 
    },
    { 
      id: 11, 
      title: t.cardTitle11 || 'Blur & Censor', 
      desc: t.cardDesc11 || 'Censor sensitive areas', 
      icon: <ScanEye className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/blur' 
    },
    { 
      id: 12, 
      title: t.cardTitle12 || 'Watermark', 
      desc: t.cardDesc12 || 'Add text or logo', 
      icon: <Stamp className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/watermark' 
    },
    { 
      id: 13, 
      title: t.cardTitle13 || 'SVG to Image', 
      desc: t.cardDesc13 || 'Convert SVG to any format', 
      icon: <FileCode className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/svg2img' 
    },
    { 
      id: 14, 
      title: t.cardTitle14 || 'Image to SVG', 
      desc: t.cardDesc14 || 'Convert any image to SVG', 
      icon: <FileImage className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={1.5} />, 
      href: '/img2svg' 
    },
  ];

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col items-center mt-16 mb-24">
        <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-[7rem] font-black tracking-tighter mb-6 sm:mb-8 gradient-text text-center pb-2 leading-tight break-words">
          {t.heroTitle}
        </h1>
        <p className="text-xl sm:text-2xl md:text-4xl text-gray-600 dark:text-slate-300 font-bold max-w-5xl mx-auto mb-12 sm:mb-20 text-center leading-snug">
          {t.heroDesc1}<br />
          <span className="text-gray-400 dark:text-slate-500 font-medium text-lg sm:text-xl md:text-2xl block mt-4">
            {t.heroDesc2}
          </span>
        </p>

        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {tools.map((tool) => (
            <Link 
              key={tool.id} 
              href={tool.href}
              className="bg-white dark:bg-slate-800 rounded-[32px] p-4 sm:p-6 md:p-10 card-shadow flex flex-col items-center text-center cursor-pointer aspect-[1/1.05] justify-center no-underline hover:scale-[1.02] transition-all"
            >
              <div className="mb-4 sm:mb-6 md:mb-8 text-[#2c3e50] dark:text-slate-300">
                {tool.icon}
              </div>
              <h3 className="text-sm sm:text-[1.15rem] font-semibold text-gray-900 dark:text-white mb-1 sm:mb-1.5 tracking-tight">
                {tool.title}
              </h3>
              <p className="text-gray-500 dark:text-slate-400 text-base font-medium">
                {tool.desc}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
