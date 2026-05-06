'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, Download, Lock, Unlock, Maximize2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import JSZip from 'jszip';

const SOCIAL_PRESETS = [
  { label: 'Instagram Square', w: 1080, h: 1080 },
  { label: 'Instagram Portrait', w: 1080, h: 1350 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Facebook Post', w: 1200, h: 630 },
  { label: 'Facebook Cover', w: 851, h: 315 },
  { label: 'Twitter Post', w: 1200, h: 675 },
  { label: 'Twitter Header', w: 1500, h: 500 },
  { label: 'LinkedIn Post', w: 1200, h: 627 },
  { label: 'LinkedIn Cover', w: 1128, h: 191 },
  { label: 'YouTube Thumbnail', w: 1280, h: 720 },
  { label: 'Pinterest Pin', w: 1000, h: 1500 },
];

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function Resize() {
  const { t } = useLanguage();
  const [magickReady, setMagickReady] = useState(false);
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState('pixels');
  const [pixelW, setPixelW] = useState('800');
  const [pixelH, setPixelH] = useState('600');
  const [lockAspect, setLockAspect] = useState(true);
  const [lastEdited, setLastEdited] = useState('w');
  const [percentage, setPercentage] = useState(50);
  const [selectedPreset, setSelectedPreset] = useState('Instagram Square');
  const [processing, setProcessing] = useState(false);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [refDims, setRefDims] = useState({ w: 0, h: 0 });
  const magickInitRef = useRef(false);

  useEffect(() => {
    if (magickInitRef.current) return;
    magickInitRef.current = true;

    if (window.__magick && window.__magick.ImageMagick) {
      setMagickReady(true);
      return;
    }

    const onReady = () => setMagickReady(true);
    const onError = (e) => setErrorMsg('Error motor: ' + (e.detail || 'desconocido'));
    window.addEventListener('magick-ready', onReady);
    window.addEventListener('magick-error', onError);

    const script = document.createElement('script');
    script.src = '/magick.umd.js';
    script.onload = async () => {
      try {
        const magick = window['magick-wasm'];
        if (!magick) throw new Error('magick-wasm module not found on window');
        const { initializeImageMagick, ImageMagick, MagickFormat } = magick;
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
    };
    script.onerror = () => {
      window.dispatchEvent(new CustomEvent('magick-error', { detail: 'Failed to load magick.umd.js' }));
    };
    document.head.appendChild(script);
  }, []);

  const parsePixels = (str) => {
    const n = parseInt(str, 10);
    return isNaN(n) || n < 1 ? null : n;
  };

  const handleFiles = (e) => {
    const raw = e.target?.files || e.dataTransfer?.files;
    const selected = Array.from(raw || []);
    if (!selected.length) return;
    const newFiles = selected.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      url: URL.createObjectURL(file),
      status: 'pending',
      origSize: file.size,
      newSize: null,
      blob: null,
      fileName: null,
      resultUrl: null,
      origW: 0,
      origH: 0,
    }));

    const firstFile = newFiles[0];
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setRefDims({ w, h });
      setPixelW(String(w));
      setPixelH(String(h));

      setFiles(prev => {
        const updated = [...prev];
        updated.forEach(f => {
          if (f.id === firstFile.id) { f.origW = w; f.origH = h; }
        });
        return updated;
      });

      newFiles.slice(1).forEach((nf) => {
        const img2 = new Image();
        img2.onload = () => {
          setFiles(prev => prev.map(f =>
            f.id === nf.id ? { ...f, origW: img2.naturalWidth, origH: img2.naturalHeight } : f
          ));
        };
        img2.src = nf.url;
      });
    };
    img.src = firstFile.url;

    setFiles(prev => [...prev, ...newFiles]);
    setWorkspaceVisible(true);
    setErrorMsg(null);
  };

  const removeFile = (id) => {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (!next.length) setWorkspaceVisible(false);
      return next;
    });
  };

  const handleWidthChange = (val) => {
    setLastEdited('w');
    setPixelW(val);
    const w = parsePixels(val);
    if (lockAspect && w && refDims.w && refDims.h) {
      setPixelH(String(Math.max(1, Math.round(w * refDims.h / refDims.w))));
    }
  };

  const handleHeightChange = (val) => {
    setLastEdited('h');
    setPixelH(val);
    const h = parsePixels(val);
    if (lockAspect && h && refDims.w && refDims.h) {
      setPixelW(String(Math.max(1, Math.round(h * refDims.w / refDims.h))));
    }
  };

  const toggleLock = () => {
    const newLock = !lockAspect;
    setLockAspect(newLock);
    if (newLock && refDims.w && refDims.h) {
      if (lastEdited === 'w') {
        const w = parsePixels(pixelW);
        if (w) setPixelH(String(Math.max(1, Math.round(w * refDims.h / refDims.w))));
      } else {
        const h = parsePixels(pixelH);
        if (h) setPixelW(String(Math.max(1, Math.round(h * refDims.w / refDims.h))));
      }
    }
  };

  const resizeAll = async () => {
    const m = window.__magick;
    if (!magickReady || !m) return;
    setProcessing(true);
    setErrorMsg(null);

    const { ImageMagick, MagickFormat } = m;
    const pending = files.filter(f => f.status !== 'processing');

    const wNum = parsePixels(pixelW) || refDims.w || 800;
    const hNum = parsePixels(pixelH) || refDims.h || 600;

    for (const item of pending) {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
      try {
        const buf = await item.file.arrayBuffer();
        const input = new Uint8Array(buf);

        let targetW, targetH;
        if (mode === 'pixels') {
          if (lockAspect && item.origW && item.origH) {
            if (lastEdited === 'w') {
              targetW = wNum;
              targetH = Math.max(1, Math.round(wNum * item.origH / item.origW));
            } else {
              targetH = hNum;
              targetW = Math.max(1, Math.round(hNum * item.origW / item.origH));
            }
          } else {
            targetW = wNum;
            targetH = hNum;
          }
        } else if (mode === 'percentage') {
          targetW = Math.max(1, Math.round(item.origW * percentage / 100));
          targetH = Math.max(1, Math.round(item.origH * percentage / 100));
        } else {
          const preset = SOCIAL_PRESETS.find(p => p.label === selectedPreset);
          targetW = preset.w;
          targetH = preset.h;
        }

        await new Promise((resolve, reject) => {
          try {
            ImageMagick.read(input, (image) => {
              try {
                image.resize(targetW, targetH);
                image.write(MagickFormat.Png, (output) => {
                  const bytes = new Uint8Array(output);
                  const blob = new Blob([bytes], { type: 'image/png' });
                  const resultUrl = URL.createObjectURL(blob);
                  const baseName = item.file.name.replace(/\.[^.]+$/, '');
                  const fileName = `${baseName}_resized.png`;

                  setFiles(prev => prev.map(f =>
                    f.id === item.id ? { ...f, status: 'done', newSize: blob.size, blob, fileName, resultUrl } : f
                  ));
                  resolve();
                });
              } catch (e) { reject(e); }
            });
          } catch (e) { reject(e); }
        });
      } catch (err) {
        console.error('Resize error:', err);
        setErrorMsg('Error: ' + err.message);
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
      }
    }
    setProcessing(false);
  };

  const downloadAll = async () => {
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (!done.length) return;

    if (done.length === 1) {
      const f = done[0];
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }

    const zip = new JSZip();
    for (const f of done) {
      zip.file(f.fileName, f.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resized_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const hasDone = files.some(f => f.status === 'done');

  const presetDims = SOCIAL_PRESETS.find(p => p.label === selectedPreset);

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.resizeTitle || 'Resize Image'}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.resizeDesc || 'Resize one or more images by exact pixels, percentage, or social media preset. Runs in your browser — no upload, no account.'}</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold">
            ⚠ {errorMsg}
          </div>
        )}

        {!workspaceVisible ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e); }}
            className="w-full bg-white dark:bg-slate-800 rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col items-center justify-center cursor-pointer card-shadow text-center relative overflow-hidden group h-80"
          >
            <input type="file" onChange={handleFiles} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" multiple accept="image/*" />
            <div className="text-[#2c3e50] dark:text-slate-300 mb-6 transition-transform group-hover:scale-110">
              <Upload className="w-20 h-20" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t.dropTitle}</h3>
            <p className="text-gray-500 dark:text-slate-400">{t.dropDesc}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8 w-full">
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-6">
              <div className="flex gap-2 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-2xl self-start flex-wrap">
                {['pixels', 'percentage', 'social'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      mode === m
                        ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {m === 'pixels' ? (t.lblPixels || 'Pixels') : m === 'percentage' ? (t.lblPercentage || 'Percentage') : (t.lblSocial || 'Social Media')}
                  </button>
                ))}
              </div>

              {mode === 'pixels' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.lblWidth || 'Width'} (px)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pixelW}
                        onChange={(e) => handleWidthChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        className="w-28 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    </div>
                    <span className="text-gray-400 dark:text-slate-500 font-bold mt-5">×</span>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.lblHeight || 'Height'} (px)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pixelH}
                        onChange={(e) => handleHeightChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        className="w-28 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    </div>
                    <button
                      onClick={toggleLock}
                      className={`p-2.5 rounded-xl mt-5 transition-all ${
                        lockAspect
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                      }`}
                      title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                    >
                      {lockAspect ? <Lock className="w-4 h-4" strokeWidth={2} /> : <Unlock className="w-4 h-4" strokeWidth={2} />}
                    </button>
                  </div>
                  {refDims.w > 0 && (
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      Original: {refDims.w} × {refDims.h}
                    </span>
                  )}
                </div>
              )}

              {mode === 'percentage' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <div className="flex flex-col gap-2 w-full sm:w-64">
                    <div className="flex justify-between">
                      <label className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.lblPercentage || 'Scale'}</label>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{percentage}%</span>
                    </div>
                    <input
                      type="range"
                      min="1" max="200"
                      value={percentage}
                      onChange={(e) => setPercentage(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                    />
                    <div className="flex gap-2">
                      {[25, 50, 75, 100, 150, 200].map(p => (
                        <button
                          key={p}
                          onClick={() => setPercentage(p)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                            percentage === p
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                  {refDims.w > 0 && (
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      {refDims.w} × {refDims.h} → {Math.max(1, Math.round(refDims.w * percentage / 100))} × {Math.max(1, Math.round(refDims.h * percentage / 100))}
                    </span>
                  )}
                </div>
              )}

              {mode === 'social' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.lblPreset || 'Preset'}</label>
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                    >
                      {SOCIAL_PRESETS.map(p => (
                        <option key={p.label} value={p.label}>{p.label} ({p.w}×{p.h})</option>
                      ))}
                    </select>
                  </div>
                  {presetDims && (
                    <div className="flex items-center gap-4 text-sm font-semibold text-gray-700 dark:text-slate-300 mt-1 sm:mt-7">
                      <span className="bg-gray-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg">{presetDims.w} × {presetDims.h} px</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={resizeAll}
                  disabled={processing || !magickReady}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> {t.lblResizing || 'Resizing...'}</>
                  ) : !magickReady ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> {t.lblLoading || 'Loading...'}</>
                  ) : (
                    <><Maximize2 className="w-5 h-5" strokeWidth={1.5}/> {t.btnResize || 'Resize All'}</>
                  )}
                </button>
                <button
                  onClick={downloadAll}
                  disabled={!hasDone || processing}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" strokeWidth={1.5}/>
                  {files.filter(f => f.status === 'done').length > 1 ? (t.lblZip || 'ZIP') : ''}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {files.map(item => (
                <div key={item.id} className={`bg-gray-50 dark:bg-slate-900 rounded-2xl p-4 flex items-center gap-4 border soft-shadow transition-all
                  ${item.status === 'done' ? 'border-green-500' : item.status === 'error' ? 'border-red-400' : 'border-gray-100 dark:border-slate-700'}`}>
                  <div className="w-16 h-16 overflow-hidden bg-gray-200 dark:bg-slate-800 flex-shrink-0">
                    <img src={item.resultUrl || item.url} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.file.name}</h4>
                    <p className="text-xs mt-1">
                      {item.status === 'done' && (
                        <span className="text-green-500 font-bold flex items-center gap-1">
                          {item.origW}×{item.origH} → {(t.lblResized || 'Resized')} {item.newSize ? `(${fmtBytes(item.newSize)})` : ''}
                        </span>
                      )}
                      {item.status === 'processing' && <span className="text-blue-500 animate-pulse">{t.lblResizing || 'Resizing...'}</span>}
                      {item.status === 'error' && <span className="text-red-500 font-semibold">{t.lblError || 'Error'}</span>}
                      {item.status === 'pending' && (
                        <span className="text-gray-400 dark:text-slate-500">
                          {item.origW > 0 ? `${item.origW}×${item.origH}` : ''} ({fmtBytes(item.origSize)})
                        </span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => removeFile(item.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-5 h-5" strokeWidth={1.5}/>
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setFiles([]); setWorkspaceVisible(false); }}
              className="mt-4 text-gray-500 dark:text-slate-400 font-medium hover:text-red-500 transition-colors self-center"
            >
              {t.btnClear}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
