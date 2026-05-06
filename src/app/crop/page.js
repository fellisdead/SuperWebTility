'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Loader2, Download, CropIcon } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const getClientXY = (e) => {
  if (e.touches && e.touches.length > 0) return { cx: e.touches[0].clientX, cy: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length > 0) return { cx: e.changedTouches[0].clientX, cy: e.changedTouches[0].clientY };
  return { cx: e.clientX, cy: e.clientY };
};

export default function Crop() {
  const { t } = useLanguage();
  const [magickReady, setMagickReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [file, setFile] = useState(null);
  const [origUrl, setOrigUrl] = useState(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [processing, setProcessing] = useState(false);
  const [displayLayout, setDisplayLayout] = useState({ dx: 0, dy: 0, dw: 0, dh: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 300, h: 200 });
  const [cropW, setCropW] = useState(300);
  const [cropH, setCropH] = useState(200);
  const [resultUrl, setResultUrl] = useState(null);
  const magickInitRef = useRef(false);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const displayLayoutRef = useRef({ dx: 0, dy: 0, dw: 0, dh: 0 });
  const imgNaturalRef = useRef({ w: 0, h: 0 });
  const cropRef = useRef({ x: 0, y: 0, w: 300, h: 200 });
  const draggingRef = useRef(false);
  const resizingRef = useRef(false);
  const resizeEdgeRef = useRef(null);
  const draggerRef = useRef({ ox: 0, oy: 0 });

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
  }, []);

  const handleFile = (e) => {
    const raw = e.target?.files?.[0] || e.dataTransfer?.files?.[0];
    if (!raw || !raw.type.startsWith('image/')) return;
    const url = URL.createObjectURL(raw);
    setOrigUrl(url);
    setFile(raw);
    setResultUrl(null);
    setErrorMsg(null);
    const img = new Image();
    img.onload = () => {
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setCropW(Math.round(img.naturalWidth / 2));
      setCropH(Math.round(img.naturalHeight / 2));
    };
    img.src = url;
  };

  const computeDisplayLayout = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = imgNatural.w;
    const ih = imgNatural.h;
    if (!iw || !ih || !cw || !ch) return;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    setDisplayLayout({ dx, dy, dw, dh });
  }, [imgNatural]);

  useEffect(() => {
    computeDisplayLayout();
    const onResize = () => computeDisplayLayout();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeDisplayLayout]);

  useEffect(() => {
    if (imgNatural.w && imgNatural.h) {
      const cx = Math.round((imgNatural.w - cropW) / 2);
      const cy = Math.round((imgNatural.h - cropH) / 2);
      setCrop({ x: Math.max(0, cx), y: Math.max(0, cy), w: cropW, h: cropH });
    }
  }, [imgNatural, cropW, cropH]);

  useEffect(() => {
    displayLayoutRef.current = displayLayout;
  }, [displayLayout]);

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    imgNaturalRef.current = imgNatural;
  }, [imgNatural]);

  const toDisplay = (px) => {
    const { dw, iw } = { dw: displayLayout.dw, iw: imgNatural.w };
    return iw ? (px / iw) * dw : 0;
  };

  const handleStart = (e) => {
    if (!containerRef.current) return;
    if (e.touches) e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const { cx, cy } = getClientXY(e);
    const mx = cx - rect.left;
    const my = cy - rect.top;
    const edge = 20;
    const dl = displayLayoutRef.current;

    const boxLeft = dl.dx + toDisplay(crop.x);
    const boxTop = dl.dy + toDisplay(crop.y);
    const boxW = toDisplay(crop.w);
    const boxH = toDisplay(crop.h);
    const boxRight = boxLeft + boxW;
    const boxBottom = boxTop + boxH;
    const near = (v, t) => Math.abs(v - t) < edge;

    if (near(mx, boxLeft) && near(my, boxTop)) { resizingRef.current = true; resizeEdgeRef.current = 'nw'; }
    else if (near(mx, boxRight) && near(my, boxTop)) { resizingRef.current = true; resizeEdgeRef.current = 'ne'; }
    else if (near(mx, boxLeft) && near(my, boxBottom)) { resizingRef.current = true; resizeEdgeRef.current = 'sw'; }
    else if (near(mx, boxRight) && near(my, boxBottom)) { resizingRef.current = true; resizeEdgeRef.current = 'se'; }
    else if (near(mx, boxLeft) && my > boxTop && my < boxBottom) { resizingRef.current = true; resizeEdgeRef.current = 'w'; }
    else if (near(mx, boxRight) && my > boxTop && my < boxBottom) { resizingRef.current = true; resizeEdgeRef.current = 'e'; }
    else if (near(my, boxTop) && mx > boxLeft && mx < boxRight) { resizingRef.current = true; resizeEdgeRef.current = 'n'; }
    else if (near(my, boxBottom) && mx > boxLeft && mx < boxRight) { resizingRef.current = true; resizeEdgeRef.current = 's'; }
    else if (mx >= boxLeft && mx <= boxRight && my >= boxTop && my <= boxBottom) {
      draggingRef.current = true;
      draggerRef.current = { ox: mx - boxLeft, oy: my - boxTop };
    }
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current && !resizingRef.current) return;
      if (e.touches) e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const { cx, cy } = getClientXY(e);
      const mx = cx - rect.left;
      const my = cy - rect.top;
      const { dx, dy, dw } = displayLayoutRef.current;
      const iw = imgNaturalRef.current.w;
      const ih = imgNaturalRef.current.h;
      if (!iw || !ih || !dw) return;

      const cr = cropRef.current;
      const td = (px) => (px / iw) * dw;
      const to = (dp) => Math.round((dp / dw) * iw);

      let nx = cr.x, ny = cr.y, nw = cr.w, nh = cr.h;

      if (draggingRef.current) {
        nx = Math.round(to(mx - dx - draggerRef.current.ox));
        ny = Math.round(to(my - dy - draggerRef.current.oy));
        nx = Math.max(0, Math.min(iw - nw, nx));
        ny = Math.max(0, Math.min(ih - nh, ny));
      }

      if (resizingRef.current) {
        const edge = resizeEdgeRef.current;
        if (edge.includes('w')) { const nl = Math.round(to(mx - dx)); nw = cr.x + cr.w - Math.max(0, Math.min(cr.x + cr.w - 10, nl)); nx = Math.max(0, Math.min(cr.x + cr.w - 10, nl)); }
        if (edge.includes('e')) nw = Math.max(10, Math.round(to(mx - dx)) - cr.x);
        if (edge.includes('n')) { const nt = Math.round(to(my - dy)); nh = cr.y + cr.h - Math.max(0, Math.min(cr.y + cr.h - 10, nt)); ny = Math.max(0, Math.min(cr.y + cr.h - 10, nt)); }
        if (edge.includes('s')) nh = Math.max(10, Math.round(to(my - dy)) - cr.y);
        nw = Math.min(iw - nx, nw);
        nh = Math.min(ih - ny, nh);
        setCropW(nw);
        setCropH(nh);
      }

      setCrop({ x: nx, y: ny, w: nw, h: nh });
    };

    const onUp = () => { draggingRef.current = false; resizingRef.current = false; resizeEdgeRef.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, []);

  const doCrop = async () => {
    const m = window.__magick;
    if (!magickReady || !m || !file) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      const { ImageMagick, MagickFormat } = m;
      const buf = await file.arrayBuffer();
      await new Promise((resolve, reject) => {
        ImageMagick.read(new Uint8Array(buf), (image) => {
          try {
            const x = Math.max(0, crop.x);
            const y = Math.max(0, crop.y);
            const w = Math.min(image.width - x, crop.w);
            const h = Math.min(image.height - y, crop.h);
            image.crop(`${w}x${h}+${x}+${y}`);
            image.resetPage();
            image.write(MagickFormat.Png, (output) => {
              const blob = new Blob([new Uint8Array(output)], { type: 'image/png' });
              if (resultUrl) URL.revokeObjectURL(resultUrl);
              setResultUrl(URL.createObjectURL(blob));
              resolve();
            });
          } catch (e) { reject(e); }
        });
      });
    } catch (err) {
      console.error('Crop error:', err);
      setErrorMsg('Error: ' + err.message);
    }
    setProcessing(false);
  };

  const downloadResult = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = file ? file.name.replace(/\.[^.]+$/, '') + '_cropped.png' : 'cropped.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const cropBoxStyle = {
    left: displayLayout.dx + toDisplay(crop.x),
    top: displayLayout.dy + toDisplay(crop.y),
    width: toDisplay(crop.w),
    height: toDisplay(crop.h),
  };

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.cropTitle || 'Crop Image'}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.cropDesc || 'Drag to set your crop area, fine-tune the width and height in pixels, and get your result instantly.'}</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        {!origUrl ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e); }}
            className="w-full bg-white dark:bg-slate-800 rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col items-center justify-center cursor-pointer card-shadow text-center relative overflow-hidden group h-80"
          >
            <input type="file" onChange={handleFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="image/*" />
            <div className="text-[#2c3e50] dark:text-slate-300 mb-6 transition-transform group-hover:scale-110">
              <Upload className="w-20 h-20" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t.dropTitle}</h3>
            <p className="text-gray-500 dark:text-slate-400">{t.dropDesc}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8 w-full">
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Width (px)</label>
                  <input type="number" value={cropW} onChange={(e) => setCropW(Math.max(10, Math.min(imgNatural.w, parseInt(e.target.value) || 10)))}
                    className="w-24 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
                </div>
                <span className="text-gray-400 font-bold mt-5">×</span>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Height (px)</label>
                  <input type="number" value={cropH} onChange={(e) => setCropH(Math.max(10, Math.min(imgNatural.h, parseInt(e.target.value) || 10)))}
                    className="w-24 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
                </div>
                <span className="text-xs text-gray-400 mt-5">/ {imgNatural.w} × {imgNatural.h} original</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={doCrop}
                  disabled={processing || !magickReady}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  {processing ? <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5}/> Cropping...</> : <><CropIcon className="w-4 h-4" strokeWidth={1.5}/> Crop</>}
                </button>
                {resultUrl && (
                  <button onClick={downloadResult} className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                    <Download className="w-4 h-4" strokeWidth={1.5}/>
                  </button>
                )}
              </div>
            </div>

            <div
              ref={containerRef}
              className="relative w-full aspect-[16/10] overflow-hidden bg-gray-900 select-none cursor-crosshair touch-none"
              onMouseDown={handleStart}
              onTouchStart={handleStart}
            >
              <img
                ref={imgRef}
                src={origUrl}
                className="absolute inset-0 w-full h-full object-contain"
                alt="crop target"
                draggable={false}
                onLoad={computeDisplayLayout}
              />
              {displayLayout.dw > 0 && (
                <>
                  <div className="absolute inset-0 bg-black/50 pointer-events-none" />
                  <div className="absolute pointer-events-none" style={{
                    left: cropBoxStyle.left, top: cropBoxStyle.top,
                    width: cropBoxStyle.width, height: cropBoxStyle.height,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                  }}>
                    <div className="w-full h-full border-2 border-white shadow-lg">
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white rounded-full shadow" />
                      <div className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow" />
                      <div className="absolute -bottom-3 -left-3 w-8 h-8 bg-white rounded-full shadow" />
                      <div className="absolute -bottom-3 -right-3 w-8 h-8 bg-white rounded-full shadow" />
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-gray-900 text-[11px] font-bold px-2 py-0.5 rounded shadow whitespace-nowrap">
                        {crop.w} × {crop.h}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {resultUrl && (
              <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col items-center gap-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Cropped Result</h3>
                <img src={resultUrl} className="max-w-full max-h-[400px]" alt="cropped result" />
              </div>
            )}

            <button
              onClick={() => { setOrigUrl(null); setFile(null); setResultUrl(null); }}
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
