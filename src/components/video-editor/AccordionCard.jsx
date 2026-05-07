'use client';

export default function AccordionCard({ icon, title, open, onToggle, children }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-[24px] card-shadow overflow-hidden transition-all">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex-1">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
