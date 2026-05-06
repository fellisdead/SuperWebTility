'use client';

import { useState, useRef, useCallback } from 'react';
import { Download, FileCode, Upload, ClipboardCopy, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tiff';

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function Img2Svg() {
  const { t } = useLanguage();
  const [image, setImage] = useState(null);
  const [imageSize, setImageSize] = useState(null);
  const [svgCode, setSvgCode] = useState('');
  const [svgBlob, setSvgBlob] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = (file) => {
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const img = new window.Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setImage(dataUrl);
        setImageSize({ w, h });

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <image href="${dataUrl}" width="${w}" height="${h}"/>\n</svg>`;
        setSvgCode(svg);
        setSvgBlob(new Blob([svg], { type: 'image/svg+xml' }));
      };
      img.onerror = () => {
        setErrorMsg(t.i2sInvalidImg || 'Failed to load image. Please try a different file.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = '';
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(svgCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = svgCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const download = () => {
    if (!svgBlob) return;
    const url = URL.createObjectURL(svgBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const hasSvg = svgCode.length > 0;

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">
            {t.i2sTitle || 'Image to SVG'}
          </h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">
            {t.i2sDesc || 'Convert any image to an SVG file. Drop a PNG, JPEG, or WebP image and get a clean, embeddable SVG document. Everything runs in your browser.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold">
            ⚠ {errorMsg}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-4">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              {t.i2sInput || 'Upload Image'}
            </label>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-colors min-h-[240px] gap-3 ${
                dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : image
                    ? 'border-gray-200 dark:border-slate-600 bg-gray-100 dark:bg-slate-900'
                    : 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-500'
              }`}
            >
              {image ? (
                <div className="flex flex-col items-center gap-2 p-4">
                  <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)_50%/16px_16px] dark:bg-[repeating-conic-gradient(#334155_0%_25%,transparent_0%_50%)_50%/16px_16px] rounded-xl overflow-hidden">
                    <img
                      src={image}
                      className="max-w-full max-h-[220px] object-contain"
                      alt="Uploaded"
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                    {imageSize?.w} × {imageSize?.h}
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-400 dark:text-slate-500" strokeWidth={1.5} />
                  <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                    {t.i2sDrop || 'Drop an image or click to browse'}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    PNG, JPEG, WebP, BMP, TIFF
                  </span>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept={ACCEPT}
              className="hidden"
            />

            {hasSvg && (
              <div className="flex gap-3">
                <button
                  onClick={download}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" strokeWidth={1.5} />
                  {t.i2sDownload || 'Download SVG'}
                </button>
                <button
                  onClick={handleCopy}
                  className="w-full sm:w-auto bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 px-6 py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <><Check className="w-5 h-5" strokeWidth={1.5} /> {t.i2sCopied || 'Copied!'}</>
                  ) : (
                    <><ClipboardCopy className="w-5 h-5" strokeWidth={1.5} /> {t.i2sCopy || 'Copy SVG'}</>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="lg:w-[400px] xl:w-[480px] bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col gap-4 min-h-[340px]">
            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
              <FileCode className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-sm font-bold uppercase tracking-wider">
                {t.i2sSvgCode || 'SVG Code'}
              </span>
              {svgBlob && (
                <span className="ml-auto text-xs text-gray-400 font-medium">
                  {fmtBytes(svgBlob.size)}
                </span>
              )}
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-slate-900 rounded-2xl overflow-hidden min-h-[280px]">
              {hasSvg ? (
                <textarea
                  value={svgCode}
                  readOnly
                  className="w-full h-full bg-transparent border-none text-gray-900 dark:text-white text-xs font-mono resize-none p-4 focus:outline-none select-all"
                  spellCheck={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-sm text-gray-400 dark:text-slate-500 font-medium">
                    {t.i2sPreviewEmpty || 'Upload an image to see the SVG code'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
