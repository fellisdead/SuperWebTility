'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, X, Loader2, Download, GripVertical } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import JSZip from 'jszip';

function BeforeAfter({ beforeUrl, afterUrl, origSize, newSize, name }) {
  const containerRef = useRef(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  const fmtBytes = (bytes) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const savings = origSize && newSize
    ? Math.round((1 - newSize / origSize) * 100)
    : 0;

  const onMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const onMouseDown = () => setDragging(true);
  const onTouchStart = () => setDragging(true);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e) => { e.preventDefault(); onMove(e.clientX); };
    const onTouchMove = (e) => { e.preventDefault(); onMove(e.touches[0].clientX); };
    const onEnd = () => setDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [dragging, onMove]);

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate flex-1">{name}</h4>
        <span className="text-xs font-bold text-green-500 ml-2">
          {savings > 0 ? `-${savings}%` : '0%'}
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative w-full aspect-[16/10] overflow-hidden bg-gray-800 select-none cursor-col-resize"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        {/* COMPRESSED - full background (right side) */}
        <img
          src={afterUrl}
          className="absolute inset-0 w-full h-full object-contain"
          alt="compressed"
          draggable={false}
        />

        {/* ORIGINAL - clipped from left */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
          <img
            src={beforeUrl}
            className="absolute inset-0 w-full h-full object-contain"
            alt="original"
            draggable={false}
          />
        </div>

        {/* Divider curtain */}
        <div
          className="absolute top-0 bottom-0 w-[3px] bg-white shadow-lg pointer-events-none"
          style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
            <GripVertical className="w-4 h-4 text-gray-400" strokeWidth={2} />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-3 right-3 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider">
          {savings > 0 ? `-${savings}%` : 'Compressed'}
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 px-1">
        <span>{fmtBytes(newSize)} compressed</span>
        <span>{fmtBytes(origSize)} original</span>
      </div>
    </div>
  );
}

export default function Compress() {
  const { t } = useLanguage();
  const [magickReady, setMagickReady] = useState(false);
  const [files, setFiles] = useState([]);
  const [compression, setCompression] = useState(0.5);
  const [processing, setProcessing] = useState(false);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const onReady = () => setMagickReady(true);
    const onError = (e) => setErrorMsg('Error motor: ' + (e.detail || 'desconocido'));
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
      compUrl: null,
      blob: null,
      fileName: null,
    }));
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

  const compressAll = async () => {
    const m = window.__magick;
    if (!magickReady || !m) return;
    setProcessing(true);
    setErrorMsg(null);

    const { ImageMagick, MagickFormat } = m;
    const qualityVal = Math.max(5, 100 - Math.round(compression * 100));
    const pending = files.filter(f => f.status !== 'processing');

    for (const item of pending) {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
      try {
        const buf = await item.file.arrayBuffer();
        const input = new Uint8Array(buf);

        await new Promise((resolve, reject) => {
          try {
            ImageMagick.read(input, (image) => {
              try {
                image.quality = qualityVal;
                image.write(MagickFormat.Jpeg, (output) => {
                  const bytes = new Uint8Array(output);
                  const blob = new Blob([bytes], { type: 'image/jpeg' });
                  const compUrl = URL.createObjectURL(blob);
                  const baseName = item.file.name.replace(/\.[^.]+$/, '');
                  const fileName = `${baseName}_compressed.jpg`;

                  setFiles(prev => prev.map(f =>
                    f.id === item.id ? { ...f, status: 'done', newSize: blob.size, compUrl, blob, fileName } : f
                  ));
                  resolve();
                });
              } catch (e) { reject(e); }
            });
          } catch (e) { reject(e); }
        });
      } catch (err) {
        console.error('Compress error:', err);
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
    a.download = 'compressed_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const fmtBytes = (bytes) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.compTitle}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.compDesc}</p>
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
            className="w-full bg-white dark:bg-slate-800 rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col items-center justify-center cursor-pointer card-shadow text-center relative overflow-hidden group h-[320px]"
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
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex flex-col gap-2 w-full sm:w-64">
                <div className="flex justify-between">
                  <label className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.lblQuality || 'Compression'}</label>
                  <span className="text-sm font-bold text-green-500">{Math.round(compression * 100)}%</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500">&larr; higher quality &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; smaller file &rarr;</p>
                <input type="range" min="0" max="1" step="0.05" value={compression}
                  onChange={(e) => setCompression(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 mt-2"
                />
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button
                  onClick={compressAll}
                  disabled={processing || !magickReady}
                  className="w-full md:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> Compressing...</>
                  ) : !magickReady ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> Loading...</>
                  ) : (
                    <><Download className="w-5 h-5" strokeWidth={1.5}/> {t.btnConvert || 'Compress All'}</>
                  )}
                </button>
                <button
                  onClick={downloadAll}
                  disabled={!files.some(f => f.status === 'done') || processing}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" strokeWidth={1.5}/>
                  {files.filter(f => f.status === 'done').length > 1 ? 'ZIP' : ''}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 w-full">
              {files.map(item => (
                <div key={item.id} className={`bg-gray-50 dark:bg-slate-900 rounded-2xl p-5 border soft-shadow transition-all
                  ${item.status === 'done' ? 'border-green-500' : item.status === 'error' ? 'border-red-400' : 'border-gray-100 dark:border-slate-700'}`}>
                  {item.status === 'done' && item.compUrl ? (
                    <BeforeAfter
                      beforeUrl={item.url}
                      afterUrl={item.compUrl}
                      origSize={item.origSize}
                      newSize={item.newSize}
                      name={item.file.name}
                    />
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 overflow-hidden bg-gray-200 dark:bg-slate-800 flex-shrink-0">
                        <img src={item.url} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.file.name}</h4>
                        <p className="text-xs mt-1">
                          {item.status === 'processing' && <span className="text-blue-500 animate-pulse">Compressing...</span>}
                          {item.status === 'error' && <span className="text-red-500 font-semibold">Error</span>}
                          {item.status === 'pending' && <span className="text-gray-400">Pending ({fmtBytes(item.origSize)})</span>}
                        </p>
                      </div>
                      <button onClick={() => removeFile(item.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                        <X className="w-5 h-5" strokeWidth={1.5}/>
                      </button>
                    </div>
                  )}
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
