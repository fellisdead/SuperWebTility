'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Loader2, Download, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const gaussianKernel5 = [
  1,  4,  6,  4, 1,
  4, 16, 24, 16, 4,
  6, 24, 36, 24, 6,
  4, 16, 24, 16, 4,
  1,  4,  6,  4, 1,
];
const kernelSum5 = 256;

const applyBoxBlur = (imageData, x, y, w, h, radius) => {
  const { data, width } = imageData;
  const copy = new Uint8ClampedArray(data);
  const r = Math.max(1, Math.round(radius));
  const kernelSize = r * 2 + 1;
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      for (let ky = -r; ky <= r; ky++) {
        for (let kx = -r; kx <= r; kx++) {
          const px = col + kx;
          const py = row + ky;
          if (px >= 0 && px < width && py >= 0 && py < imageData.height) {
            const idx = (py * width + px) * 4;
            sr += copy[idx];
            sg += copy[idx + 1];
            sb += copy[idx + 2];
            count++;
          }
        }
      }
      const idx = (row * width + col) * 4;
      data[idx] = sr / count;
      data[idx + 1] = sg / count;
      data[idx + 2] = sb / count;
    }
  }
};

const applyPixelate = (imageData, x, y, w, h, size) => {
  const { data, width } = imageData;
  const s = Math.max(2, Math.round(size));
  for (let row = y; row < y + h; row += s) {
    for (let col = x; col < x + w; col += s) {
      let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
      const maxR = Math.min(row + s, y + h);
      const maxC = Math.min(col + s, x + w);
      for (let r = row; r < maxR; r++) {
        for (let c = col; c < maxC; c++) {
          const idx = (r * width + c) * 4;
          sr += data[idx];
          sg += data[idx + 1];
          sb += data[idx + 2];
          sa += data[idx + 3];
          count++;
        }
      }
      const avgR = sr / count, avgG = sg / count, avgB = sb / count, avgA = sa / count;
      for (let r = row; r < maxR; r++) {
        for (let c = col; c < maxC; c++) {
          const idx = (r * width + c) * 4;
          data[idx] = avgR;
          data[idx + 1] = avgG;
          data[idx + 2] = avgB;
          data[idx + 3] = avgA;
        }
      }
    }
  }
};

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function Blur() {
  const { t } = useLanguage();
  const [file, setFile] = useState(null);
  const [origUrl, setOrigUrl] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultBlob, setResultBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [mode, setMode] = useState('blur');
  const [blurStrength, setBlurStrength] = useState(8);
  const [pixelSize, setPixelSize] = useState(8);
  const [rects, setRects] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const originalCtxRef = useRef(null);
  const processedCanvasRef = useRef(null);

  const handleFile = (e) => {
    const raw = e.target?.files || e.dataTransfer?.files;
    const selected = Array.from(raw || []);
    if (!selected.length) return;
    const f = selected[0];
    const url = URL.createObjectURL(f);
    setFile(f);
    setOrigUrl(url);
    setResultUrl(null);
    setResultBlob(null);
    setRects([]);
    setWorkspaceVisible(true);
    setErrorMsg(null);
    const img = new Image();
    img.onload = () => setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  };

  const clearAll = () => {
    setFile(null);
    setOrigUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setRects([]);
    setWorkspaceVisible(false);
  };

  const getCanvasPos = (e) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = imgNatural.w / rect.width;
    const scaleY = imgNatural.h / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    if (!pos) return;
    setDrawing(true);
    setDragStart(pos);
  };

  const handlePointerMove = (e) => {
    if (!drawing || !dragStart) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    if (!pos) return;
    const x = Math.min(dragStart.x, pos.x);
    const y = Math.min(dragStart.y, pos.y);
    const w = Math.abs(pos.x - dragStart.x);
    const h = Math.abs(pos.y - dragStart.y);
    const last = rects.length > 0 ? rects[rects.length - 1] : null;
    if (last && last._temp) {
      setRects(prev => [...prev.slice(0, -1), { x, y, w, h, mode, _temp: true }]);
    } else {
      setRects(prev => [...prev, { x, y, w, h, mode, _temp: true }]);
    }
  };

  const handlePointerUp = (e) => {
    if (!drawing || !dragStart) return;
    setDrawing(false);
    const pos = getCanvasPos(e);
    if (!pos) { setDragStart(null); return; }
    const x = Math.min(dragStart.x, pos.x);
    const y = Math.min(dragStart.y, pos.y);
    const w = Math.abs(pos.x - dragStart.x);
    const h = Math.abs(pos.y - dragStart.y);
    setDragStart(null);
    if (w < 5 || h < 5) return;
    setRects(prev => {
      const filtered = prev.filter(r => !r._temp);
      return [...filtered, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), mode }];
    });
  };

  const removeRect = (i) => {
    setRects(prev => prev.filter((_, idx) => idx !== i));
  };

  const processImage = useCallback(() => {
    if (!origUrl || !imgNatural.w) return;
    setProcessing(true);
    const canvas = document.createElement('canvas');
    canvas.width = imgNatural.w;
    canvas.height = imgNatural.h;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const activeRects = rects.filter(r => !r._temp && r.w >= 5 && r.h >= 5);
      for (const r of activeRects) {
        const rx = Math.max(0, Math.round(r.x));
        const ry = Math.max(0, Math.round(r.y));
        const rw = Math.round(r.w);
        const rh = Math.round(r.h);
        if (r.mode === 'blur') {
          const passes = Math.max(1, Math.round(blurStrength / 3));
          for (let p = 0; p < passes; p++) {
            applyBoxBlur(imageData, rx, ry, rw, rh, blurStrength / passes);
          }
        } else if (r.mode === 'pixelate') {
          applyPixelate(imageData, rx, ry, rw, rh, pixelSize);
        } else if (r.mode === 'blackbar') {
          for (let row = ry; row < ry + rh; row++) {
            for (let col = rx; col < rx + rw; col++) {
              const idx = (row * canvas.width + col) * 4;
              imageData.data[idx] = 0;
              imageData.data[idx + 1] = 0;
              imageData.data[idx + 2] = 0;
              imageData.data[idx + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setResultUrl(url);
        setResultBlob(blob);
        setProcessing(false);
      }, 'image/png');
    };
    img.src = origUrl;
  }, [origUrl, imgNatural, rects, blurStrength, pixelSize, mode]);

  const downloadResult = () => {
    if (!resultBlob || !file) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    a.download = `${baseName}_censored.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const MODES = [
    { id: 'blur', label: t.blModeBlur || 'Blur', desc: t.blBlurDesc || 'Soft Gaussian blur' },
    { id: 'pixelate', label: t.blModePixelate || 'Pixelate', desc: t.blPixelateDesc || 'Mosaic effect' },
    { id: 'blackbar', label: t.blModeBlackbar || 'Black Bar', desc: t.blBlackbarDesc || 'Solid black rectangle' },
  ];

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.blTitle || 'Blur & Censor'}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.blDesc || 'Blur an image or just the parts that matter. Drag rectangles over faces, license plates, and IDs to censor them.'}</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold">
            ⚠ {errorMsg}
          </div>
        )}

        {!workspaceVisible ? (
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
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-6">
              <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-2xl self-start">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      mode === m.id
                        ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                    title={m.desc}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === 'blur' && (
                <div className="flex items-center gap-4">
                  <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t.blStrength || 'Strength'}</label>
                  <input type="range" min="1" max="20" value={blurStrength} onChange={(e) => setBlurStrength(parseInt(e.target.value))} className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700" />
                  <span className="text-sm font-bold text-gray-700 dark:text-slate-300 w-6">{blurStrength}</span>
                </div>
              )}
              {mode === 'pixelate' && (
                <div className="flex items-center gap-4">
                  <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t.blPixelSize || 'Size'}</label>
                  <input type="range" min="2" max="30" value={pixelSize} onChange={(e) => setPixelSize(parseInt(e.target.value))} className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700" />
                  <span className="text-sm font-bold text-gray-700 dark:text-slate-300 w-6">{pixelSize}</span>
                </div>
              )}
              {mode === 'blackbar' && (
                <p className="text-xs text-gray-400 dark:text-slate-500">{t.blBlackbarHint || 'Drag rectangles on the image to place solid black bars.'}</p>
              )}

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={processImage}
                  disabled={processing || !origUrl}
                  className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.blApply || 'Apply'}</> : <><EyeOff className="w-4 h-4" /> {t.blApply || 'Apply Censor'}</>}
                </button>
                {resultBlob && (
                  <button onClick={downloadResult} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                    <Download className="w-4 h-4" /> {t.bgDownload || 'Download'}
                  </button>
                )}
              </div>

              {rects.filter(r => !r._temp).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {rects.filter(r => !r._temp).map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <span className="text-gray-600 dark:text-slate-300">
                        {r.mode === 'blur' ? '🔵' : r.mode === 'pixelate' ? '🔲' : '⬛'} {r.w}×{r.h}
                      </span>
                      <button onClick={() => removeRect(i)} className="text-gray-400 hover:text-red-500 ml-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setRects([])} className="text-xs text-gray-400 hover:text-red-500 font-medium ml-2 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> {t.blClearRects || 'Clear all'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col lg:flex-row gap-6 w-full">
              <div className="flex-1 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.blEditor || 'Editor'}</h3>
                <div
                  ref={containerRef}
                  className="relative w-full overflow-hidden bg-gray-200 dark:bg-slate-600 select-none cursor-crosshair touch-none border-2 border-gray-300 dark:border-slate-500"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  {origUrl && (
                    <img
                      ref={imgRef}
                      src={origUrl}
                      className="w-full h-auto block"
                      alt=""
                      draggable={false}
                    />
                  )}

                  {origUrl && imgNatural.w > 0 && rects.filter(r => !r._temp).map((r, i) => (
                    <div
                      key={i}
                      className="absolute border-2 pointer-events-none"
                      style={{
                        left: `${(r.x / imgNatural.w) * 100}%`,
                        top: `${(r.y / imgNatural.h) * 100}%`,
                        width: `${(r.w / imgNatural.w) * 100}%`,
                        height: `${(r.h / imgNatural.h) * 100}%`,
                        borderColor: r.mode === 'blur' ? '#3b82f6' : r.mode === 'pixelate' ? '#f59e0b' : '#000',
                        backgroundColor: r.mode === 'blackbar' ? 'rgba(0,0,0,0.6)' : 'rgba(59,130,246,0.1)',
                      }}
                    >
                      <span className="absolute -top-6 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap" style={{ backgroundColor: r.mode === 'blur' ? '#3b82f6' : r.mode === 'pixelate' ? '#f59e0b' : '#000' }}>
                        {r.mode === 'blur' ? 'Blur' : r.mode === 'pixelate' ? 'Pixel' : 'Bar'}
                      </span>
                    </div>
                  ))}

                  {drawing && dragStart && rects.filter(r => r._temp).map((r, i) => (
                    <div
                      key={`temp-${i}`}
                      className="absolute border-2 border-dashed border-purple-400 bg-purple-400/20 pointer-events-none"
                      style={{
                        left: `${(r.x / imgNatural.w) * 100}%`,
                        top: `${(r.y / imgNatural.h) * 100}%`,
                        width: `${(r.w / imgNatural.w) * 100}%`,
                        height: `${(r.h / imgNatural.h) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.blResult || 'Result'}</h3>
                {resultUrl ? (
                  <img src={resultUrl} className="w-full h-auto border-2 border-green-400 dark:border-green-600" alt="result" />
                ) : (
                  <div className="w-full aspect-[4/3] bg-gray-100 dark:bg-slate-700 border-2 border-dashed border-gray-300 dark:border-slate-500 flex items-center justify-center">
                    <p className="text-sm text-gray-400 dark:text-slate-500">{t.blResultPlaceholder || 'Click Apply Censor to see the result'}</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={clearAll}
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
