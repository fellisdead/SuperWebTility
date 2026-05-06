'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Download, FileCode, ImageIcon, Zap, Upload, ClipboardCopy, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const FORMATS = ['PNG', 'JPEG', 'WEBP', 'BMP', 'TIFF', 'ICO'];
const CANVAS_FORMATS = { PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp' };
const IMG_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tiff';
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="80" fill="#6366f1" />
  <rect x="40" y="80" width="120" height="40" rx="8" fill="white" opacity="0.9" />
  <text x="100" y="108" text-anchor="middle" fill="#4f46e5" font-size="22" font-weight="bold">SVG</text>
</svg>`;

const DANGEROUS_TAGS = ['script', 'foreignObject', 'foreignobject'];
const DANGEROUS_ATTRS = /^on\w+|^href$|^xlink:href$|^action$|^formaction$/i;
const JS_URL_RE = /^\s*javascript:/i;

const sanitizeSvg = (raw) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    const errNode = doc.querySelector('parsererror');
    if (errNode) return raw;

    const walk = (node) => {
      const toRemove = [];
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        const tag = child.tagName.toLowerCase();
        if (DANGEROUS_TAGS.includes(tag)) {
          toRemove.push(child);
          continue;
        }
        const attrsToRemove = [];
        for (const attr of child.attributes) {
          if (DANGEROUS_ATTRS.test(attr.name) && (attr.name !== 'href' || JS_URL_RE.test(attr.value))) {
            attrsToRemove.push(attr.name);
          }
        }
        for (const a of attrsToRemove) child.removeAttribute(a);
        walk(child);
      }
      for (const r of toRemove) node.removeChild(r);
    };
    walk(doc.documentElement);

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch {
    return raw;
  }
};

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function Svg2Img() {
  const { t } = useLanguage();
  const [mode, setMode] = useState('svg2img');

  // ── SVG → Image state ──
  const [magickReady, setMagickReady] = useState(false);
  const [svgCode, setSvgCode] = useState('');
  const [format, setFormat] = useState('PNG');
  const [pixelW, setPixelW] = useState('');
  const [pixelH, setPixelH] = useState('');
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [result, setResult] = useState(null);
  const [hasSvg, setHasSvg] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // ── Image → SVG state ──
  const [image, setImage] = useState(null);
  const [imageSize, setImageSize] = useState(null);
  const [svgOutput, setSvgOutput] = useState('');
  const [svgBlob, setSvgBlob] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const textareaRef = useRef(null);
  const svgBlobUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── ImageMagick WASM init ──
  useEffect(() => {
    const onReady = () => setMagickReady(true);
    const onError = (e) => setErrorMsg('Engine error: ' + (e.detail || 'unknown'));
    window.addEventListener('magick-ready', onReady);
    window.addEventListener('magick-error', onError);

    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      try {
        const { initializeImageMagick, ImageMagick, MagickFormat } = await import('/magick-wasm.js');
        const res = await fetch('/magick.wasm');
        if (!res.ok) throw new Error('magick.wasm not found: ' + res.status);
        const buf = await res.arrayBuffer();
        await initializeImageMagick(new Uint8Array(buf));
        window.__magick = { ImageMagick, MagickFormat };
        window.dispatchEvent(new Event('magick-ready'));
      } catch (err) {
        console.error('[magick] init failed:', err);
        window.dispatchEvent(new CustomEvent('magick-error', { detail: err.message }));
      }
    `;
    document.head.appendChild(script);

    return () => {
      window.removeEventListener('magick-ready', onReady);
      window.removeEventListener('magick-error', onError);
    };
  }, []);

  // Reset error when switching modes
  const switchMode = (newMode) => {
    setMode(newMode);
    setErrorMsg(null);
    setResult(null);
  };

  // ── SVG → Image: handlers ──
  const handleSvgChange = (val) => {
    const clean = sanitizeSvg(val);
    setSvgCode(clean);
    setHasSvg(clean.trim().length > 0);
    setResult(null);
    setErrorMsg(null);
  };

  const handleSvgFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleSvgChange(ev.target.result);
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    handleSvgChange(SAMPLE_SVG);
  };

  useEffect(() => {
    if (!hasSvg) { setPreviewUrl(null); return; }
    if (svgBlobUrlRef.current) URL.revokeObjectURL(svgBlobUrlRef.current);
    const blob = new Blob([svgCode], { type: 'image/svg+xml' });
    svgBlobUrlRef.current = URL.createObjectURL(blob);
    setPreviewUrl(svgBlobUrlRef.current);
  }, [svgCode, hasSvg]);

  const convertSvg2Img = async () => {
    if (!svgCode.trim()) {
      setErrorMsg(t.s2iEmpty || 'Paste some SVG code first.');
      return;
    }
    const needsMagick = !CANVAS_FORMATS[format];
    if (needsMagick && !magickReady) {
      setErrorMsg('ImageMagick engine is loading. Try PNG, JPEG, or WebP instead.');
      return;
    }

    setProcessing(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const { blob: pngBlob, w, h } = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          if (useCustomSize) {
            const cw = parseInt(pixelW, 10) || img.naturalWidth || 300;
            const ch = parseInt(pixelH, 10) || img.naturalHeight || 300;
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, cw, ch);
          } else {
            canvas.width = img.naturalWidth || 300;
            canvas.height = img.naturalHeight || 300;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
          }
          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Canvas render failed'));
            resolve({ blob, w: canvas.width, h: canvas.height });
          }, 'image/png');
        };
        img.onerror = () => reject(new Error('SVG failed to render. Check your code for errors.'));
        img.src = URL.createObjectURL(new Blob([svgCode], { type: 'image/svg+xml' }));
      });

      const ext = format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase();

      if (CANVAS_FORMATS[format]) {
        let finalBlob = pngBlob;
        if (format === 'JPEG' || format === 'WEBP') {
          finalBlob = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (format === 'JPEG') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(resolve, CANVAS_FORMATS[format], 0.95);
            };
            img.src = URL.createObjectURL(pngBlob);
          });
        }
        const resultUrl = URL.createObjectURL(finalBlob);
        setResult({ url: resultUrl, blob: finalBlob, size: finalBlob.size, ext, w, h });
      } else {
        const m = window.__magick;
        if (!m) return;
        const { ImageMagick, MagickFormat } = m;
        const buf = await pngBlob.arrayBuffer();
        const targetFmt = MagickFormat[format] || MagickFormat.Bmp;

        await new Promise((resolve, reject) => {
          try {
            ImageMagick.read(new Uint8Array(buf), (image) => {
              try {
                image.write(targetFmt, (output) => {
                  const bytes = new Uint8Array(output);
                  const blob = new Blob([bytes], { type: `image/${ext}` });
                  const resultUrl = URL.createObjectURL(blob);
                  setResult({ url: resultUrl, blob, size: blob.size, ext, w, h });
                  resolve();
                });
              } catch (e) { reject(e); }
            });
          } catch (e) { reject(e); }
        });
      }
    } catch (err) {
      console.error('SVG convert error:', err);
      setErrorMsg('Error: ' + (err.message || 'Conversion failed. Check your SVG code.'));
    }
    setProcessing(false);
  };

  const canConvert = hasSvg && !processing;

  // ── Image → SVG: handlers ──
  const processImageFile = (file) => {
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
        setSvgOutput(svg);
        setSvgBlob(new Blob([svg], { type: 'image/svg+xml' }));
      };
      img.onerror = () => {
        setErrorMsg(t.s2iInvalidImg || 'Failed to load image. Please try a different file.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleImgFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
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
    if (file) processImageFile(file);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(svgOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = svgOutput;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasSvgOutput = svgOutput.length > 0;

  // ── Render ──
  const isSvg2Img = mode === 'svg2img';

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">
            {t.s2iTitle || 'SVG ↔ Image Converter'}
          </h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">
            {t.s2iDesc || 'Switch between converting SVG to raster images and converting raster images to SVG. Everything runs in your browser.'}
          </p>

          {/* ── Mode toggle ── */}
          <div className="mt-6 inline-flex bg-gray-100 dark:bg-slate-800 rounded-2xl p-1.5 shadow-inner">
            <button
              onClick={() => switchMode('svg2img')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
                isSvg2Img
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              <FileCode className="w-4 h-4 inline mr-1.5" strokeWidth={2} />
              {t.s2iModeSvg2Img || 'SVG → Image'}
            </button>
            <button
              onClick={() => switchMode('img2svg')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
                !isSvg2Img
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              <ImageIcon className="w-4 h-4 inline mr-1.5" strokeWidth={2} />
              {t.s2iModeImg2Svg || 'Image → SVG'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold">
            ⚠ {errorMsg}
          </div>
        )}

        {/* ── SVG → Image UI ── */}
        {isSvg2Img && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  {t.s2iSvgCode || 'SVG Code'}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={loadSample}
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                  >
                    {t.s2iSample || 'Load sample'}
                  </button>
                  <label className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer">
                    {t.s2iUpload || 'Upload .svg'}
                    <input type="file" onChange={handleSvgFileUpload} accept=".svg" className="hidden" />
                  </label>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={svgCode}
                onChange={(e) => handleSvgChange(e.target.value)}
                placeholder={t.s2iPlaceholder || '<svg xmlns="http://www.w3.org/2000/svg"...'}
                rows={10}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[200px]"
                spellCheck={false}
              />

              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    {t.lblFormat || 'Format'}
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                  >
                    {FORMATS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  {!CANVAS_FORMATS[format] && !magickReady && (
                    <span className="text-xs text-amber-500 font-medium w-40">Loading engine for {format}…</span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      {t.s2iSize || 'Output Size'}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useCustomSize}
                        onChange={(e) => setUseCustomSize(e.target.checked)}
                        className="rounded"
                      />
                      {t.s2iCustom || 'Custom'}
                    </label>
                  </div>
                  {useCustomSize && (
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pixelW}
                        onChange={(e) => setPixelW(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder={t.lblWidth || 'Width'}
                        className="w-28 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                      <span className="text-gray-400 font-bold">×</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pixelH}
                        onChange={(e) => setPixelH(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder={t.lblHeight || 'Height'}
                        className="w-28 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    </div>
                  )}
                  {!useCustomSize && (
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      {t.s2iAutoSize || 'Uses the SVG viewBox dimensions'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={convertSvg2Img}
                  disabled={!canConvert}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} /> {t.s2iConverting || 'Converting...'}</>
                  ) : (
                    <><Zap className="w-5 h-5" strokeWidth={1.5} /> {t.btnConvert || 'Convert'}</>
                  )}
                </button>
                {result && (
                  <button
                    onClick={() => {
                      if (!result) return;
                      const url = URL.createObjectURL(result.blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `svg_export.${result.ext}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                    }}
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" strokeWidth={1.5} />
                    {result.ext.toUpperCase()}
                  </button>
                )}
              </div>
            </div>

            {/* Preview panel */}
            <div className="lg:w-[400px] xl:w-[480px] bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col gap-4 min-h-[300px]">
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                {result ? (
                  <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
                ) : (
                  <FileCode className="w-5 h-5" strokeWidth={1.5} />
                )}
                <span className="text-sm font-bold uppercase tracking-wider">
                  {result ? (t.s2iResult || 'Result') : (t.wmPreview || 'Preview')}
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-slate-900 rounded-2xl overflow-hidden min-h-[200px]">
                {result ? (
                  <div className="flex flex-col items-center gap-3 p-4 w-full">
                    <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)_50%/16px_16px] dark:bg-[repeating-conic-gradient(#334155_0%_25%,transparent_0%_50%)_50%/16px_16px] rounded-xl overflow-hidden max-h-[280px]">
                      <img src={result.url} className="max-w-full max-h-[280px] object-contain" alt="Result" />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                      {result.w} × {result.h} — {fmtBytes(result.size)}
                    </span>
                  </div>
                ) : hasSvg ? (
                  <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)_50%/16px_16px] dark:bg-[repeating-conic-gradient(#334155_0%_25%,transparent_0%_50%)_50%/16px_16px] rounded-xl overflow-hidden max-h-[280px]">
                    <img src={previewUrl} className="max-w-full max-h-[280px] object-contain" alt="SVG Preview" />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-slate-500 font-medium">
                    {t.s2iPreviewEmpty || 'Paste SVG code to see a preview'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Image → SVG UI ── */}
        {!isSvg2Img && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-4">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                {t.s2iUploadImg || 'Upload Image'}
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-colors min-h-[260px] gap-3 ${
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
                      <img src={image} className="max-w-full max-h-[220px] object-contain" alt="Uploaded" />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                      {imageSize?.w} × {imageSize?.h}
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-400 dark:text-slate-500" strokeWidth={1.5} />
                    <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                      {t.s2iDropImg || 'Drop an image or click to browse'}
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
                onChange={handleImgFileChange}
                accept={IMG_ACCEPT}
                className="hidden"
              />

              {hasSvgOutput && (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (!svgBlob) return;
                      const url = URL.createObjectURL(svgBlob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'image.svg';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                    }}
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" strokeWidth={1.5} />
                    {t.s2iDownloadSvg || 'Download SVG'}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="w-full sm:w-auto bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 px-6 py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <><Check className="w-5 h-5" strokeWidth={1.5} /> {t.s2iCopied || 'Copied!'}</>
                    ) : (
                      <><ClipboardCopy className="w-5 h-5" strokeWidth={1.5} /> {t.s2iCopySvg || 'Copy SVG'}</>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="lg:w-[400px] xl:w-[480px] bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col gap-4 min-h-[340px]">
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                <FileCode className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm font-bold uppercase tracking-wider">
                  {t.s2iSvgCode || 'SVG Code'}
                </span>
                {svgBlob && (
                  <span className="ml-auto text-xs text-gray-400 font-medium">
                    {fmtBytes(svgBlob.size)}
                  </span>
                )}
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-slate-900 rounded-2xl overflow-hidden min-h-[280px]">
                {hasSvgOutput ? (
                  <textarea
                    value={svgOutput}
                    readOnly
                    className="w-full h-full bg-transparent border-none text-gray-900 dark:text-white text-xs font-mono resize-none p-4 focus:outline-none select-all"
                    spellCheck={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-sm text-gray-400 dark:text-slate-500 font-medium">
                      {t.s2iImgSvgEmpty || 'Upload an image to see the SVG code'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
