'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, Download, Eraser, Paintbrush, Pipette, Wand2, Plus, Minus, RotateCcw, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import JSZip from 'jszip';

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function RemoveBg() {
  const { t } = useLanguage();
  const [mode, setMode] = useState('auto');
  const [files, setFiles] = useState([]);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [bgRemoval, setBgRemoval] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [autoEta, setAutoEta] = useState(null);
  const progressStartRef = useRef(0);

  const [brushSize, setBrushSize] = useState(20);
  const [brushMode, setBrushMode] = useState('remove');
  const [manualFileId, setManualFileId] = useState(null);

  const [tolerance, setTolerance] = useState(40);
  const [pickedColors, setPickedColors] = useState([]);
  const [colorFileId, setColorFileId] = useState(null);
  const [contiguousOnly, setContiguousOnly] = useState(true);
  const colorClickPosRef = useRef(null);

  const canvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@imgly/background-removal');
        if (!cancelled) {
          setBgRemoval(mod);
        }
      } catch (err) {
        console.warn('[bg-removal] module import failed, auto mode disabled:', err.message);
      }
    })();
    return () => { cancelled = true; };
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
      blob: null,
      fileName: null,
      resultUrl: null,
      progress: 0,
    }));
    setFiles(prev => {
      const updated = [...prev, ...newFiles];
      if (mode === 'manual' && !manualFileId && updated.some(f => f.status !== 'processing')) {
        setTimeout(() => {
          const available = updated.filter(f => f.status !== 'processing');
          if (available.length) setManualFileId(available[0].id);
        }, 100);
      }
      if (mode === 'color' && !colorFileId && updated.some(f => f.status !== 'processing')) {
        setTimeout(() => {
          const available = updated.filter(f => f.status !== 'processing');
          if (available.length) setColorFileId(available[0].id);
        }, 100);
      }
      return updated;
    });
    setWorkspaceVisible(true);
    setErrorMsg(null);
  };

  const removeFile = (id) => {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (!next.length) setWorkspaceVisible(false);
      return next;
    });
    if (manualFileId === id) setManualFileId(null);
    if (colorFileId === id) { setColorFileId(null); setPickedColors([]); }
  };

  const processAuto = async () => {
    if (!bgRemoval) { setErrorMsg('Background removal engine not available. Check console for details.'); return; }
    setProcessing(true);
    setErrorMsg(null);
    setAutoProgress(0);
    setAutoEta(null);
    const pending = files.filter(f => f.status !== 'processing');
    const total = pending.length;
    let completed = 0;
    progressStartRef.current = Date.now();
    setModelLoading(true);
    try {
      for (const item of pending) {
        const fileStartTime = Date.now();
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing', progress: 0 } : f));
        try {
          const blob = await bgRemoval.removeBackground(item.url, {
            publicPath: window.location.origin + '/api/proxy/imgly/',
            model: 'medium',
            output: { format: 'image/png', quality: 1 },
            progress: (key, current, total_1) => {
              const fileProgress = Math.round((current / total_1) * 100);
              setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: fileProgress } : f));
              const overall = Math.round(((completed + current / total_1) / total) * 100);
              setAutoProgress(overall);
              const elapsed = (Date.now() - progressStartRef.current) / 1000;
              if (overall > 0 && overall < 100) {
                const eta = Math.round((elapsed / overall) * (100 - overall));
                setAutoEta(eta);
              }
              if (current === total_1) {
                const fileElapsed = (Date.now() - fileStartTime) / 1000;
                setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: 100 } : f));
              }
            },
          });
          const resultUrl = URL.createObjectURL(blob);
          const baseName = item.file.name.replace(/\.[^.]+$/, '');
          const fileName = `${baseName}_nobg.png`;
          setFiles(prev => prev.map(f =>
            f.id === item.id ? { ...f, status: 'done', newSize: blob.size, blob, fileName, resultUrl, progress: 100 } : f
          ));
          completed++;
        } catch (err) {
          console.error('Auto remove error:', err);
          setErrorMsg('Auto remove failed: ' + err.message);
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', progress: 0 } : f));
          completed++;
        }
      }
      setAutoProgress(100);
      setAutoEta(0);
    } finally {
      setModelLoading(false);
      setProcessing(false);
    }
  };

  const openManualEditor = (fileId) => {
    setManualFileId(fileId);
    setBrushMode('remove');
  };

  const closeManualEditor = () => {
    setManualFileId(null);
    isDrawingRef.current = false;
  };

  useEffect(() => {
    if (!manualFileId) return;
    const fileItem = files.find(f => f.id === manualFileId);
    if (!fileItem) return;
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const maxW = Math.min(img.naturalWidth, 900);
      const scale = maxW / img.naturalWidth;
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      canvas.width = w;
      canvas.height = h;
      maskCanvas.width = w;
      maskCanvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const mctx = maskCanvas.getContext('2d');
      mctx.clearRect(0, 0, w, h);
    };
    img.src = fileItem.url;
  }, [manualFileId, files]);

  const getCanvasPos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const drawBrush = (x, y) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext('2d');
    mctx.globalCompositeOperation = brushMode === 'remove' ? 'source-over' : 'destination-out';
    mctx.fillStyle = 'rgba(0,0,0,1)';
    mctx.beginPath();
    mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    mctx.fill();
  };

  const handleManualPointerDown = (e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const pos = getCanvasPos(maskCanvasRef.current, e);
    lastPosRef.current = pos;
    drawBrush(pos.x, pos.y);
  };

  const handleManualPointerMove = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const pos = getCanvasPos(maskCanvasRef.current, e);
    const mctx = maskCanvasRef.current.getContext('2d');
    mctx.globalCompositeOperation = brushMode === 'remove' ? 'source-over' : 'destination-out';
    mctx.fillStyle = 'rgba(0,0,0,1)';
    mctx.lineWidth = brushSize;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.beginPath();
    mctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    mctx.lineTo(pos.x, pos.y);
    mctx.stroke();
    lastPosRef.current = pos;
  };

  const handleManualPointerUp = () => {
    isDrawingRef.current = false;
  };

  const clearManualMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext('2d');
    mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  };

  const applyManualMask = () => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;
    const ctx = canvas.getContext('2d');
    const mctx = maskCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskData = mctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const pixels = imageData.data;
    const maskPixels = maskData.data;
    for (let i = 0; i < maskPixels.length; i += 4) {
      if (maskPixels[i + 3] > 0) {
        pixels[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const fileItem = files.find(f => f.id === manualFileId);
      if (!fileItem) return;
      const resultUrl = URL.createObjectURL(blob);
      const baseName = fileItem.file.name.replace(/\.[^.]+$/, '');
      const fileName = `${baseName}_nobg.png`;
      setFiles(prev => prev.map(f =>
        f.id === manualFileId ? { ...f, status: 'done', newSize: blob.size, blob, fileName, resultUrl } : f
      ));
    }, 'image/png');
    setManualFileId(null);
  };

  const openColorPicker = (fileId) => {
    setColorFileId(fileId);
    setPickedColors([]);
  };

  const closeColorPicker = () => {
    setColorFileId(null);
    setPickedColors([]);
  };

  const handleColorPick = (e) => {
    const fileItem = files.find(f => f.id === colorFileId);
    if (!fileItem) return;
    const rect = e.target.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const x = Math.floor(clickX * img.naturalWidth);
      const y = Math.floor(clickY * img.naturalHeight);
      colorClickPosRef.current = { x, y, w: img.naturalWidth, h: img.naturalHeight };
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const color = { r: pixel[0], g: pixel[1], b: pixel[2] };
      setPickedColors(prev => {
        const exists = prev.some(c => c.r === color.r && c.g === color.g && c.b === color.b);
        if (exists) return prev.filter(c => !(c.r === color.r && c.g === color.g && c.b === color.b));
        return [...prev, color];
      });
    };
    img.src = fileItem.url;
  };

  const floodFillMask = (imageData, startX, startY, colors, tol) => {
    const { width, height, data } = imageData;
    const visited = new Uint8Array(width * height);
    const mask = new Uint8Array(width * height);
    const stack = [startX, startY];
    const idx = (x, y) => y * width + x;
    const key = startY * width + startX;
    visited[key] = 1;
    mask[key] = 1;

    while (stack.length > 0) {
      const y = stack.pop();
      const x = stack.pop();
      const neighbors = [
        [x - 1, y], [x + 1, y],
        [x, y - 1], [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nk = idx(nx, ny);
        if (visited[nk]) continue;
        visited[nk] = 1;
        const ri = nk * 4;
        const r = data[ri], g = data[ri + 1], b = data[ri + 2];
        let matches = false;
        for (const pc of colors) {
          const dr = r - pc.r, dg = g - pc.g, db = b - pc.b;
          if (Math.sqrt(dr * dr + dg * dg + db * db) <= tol) {
            matches = true;
            break;
          }
        }
        if (matches) {
          mask[nk] = 1;
          stack.push(nx, ny);
        }
      }
    }
    return mask;
  };

  const processColor = () => {
    if (!pickedColors.length) { setErrorMsg('Pick at least one color to remove.'); return; }
    const fileItem = files.find(f => f.id === colorFileId);
    if (!fileItem) return;
    setProcessing(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      const tol = tolerance;

      if (contiguousOnly && colorClickPosRef.current) {
        const startX = colorClickPosRef.current.x;
        const startY = colorClickPosRef.current.y;
        const mask = floodFillMask(imageData, startX, startY, pickedColors, tol);
        for (let idx = 0; idx < mask.length; idx++) {
          if (mask[idx]) {
            pixels[idx * 4 + 3] = 0;
          }
        }
      } else {
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          for (const pc of pickedColors) {
            const dr = r - pc.r, dg = g - pc.g, db = b - pc.b;
            if (Math.sqrt(dr * dr + dg * dg + db * db) <= tol) {
              pixels[i + 3] = 0;
              break;
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { setProcessing(false); return; }
        const resultUrl = URL.createObjectURL(blob);
        const baseName = fileItem.file.name.replace(/\.[^.]+$/, '');
        const fileName = `${baseName}_nobg.png`;
        setFiles(prev => prev.map(f =>
          f.id === colorFileId ? { ...f, status: 'done', newSize: blob.size, blob, fileName, resultUrl } : f
        ));
        setProcessing(false);
        setColorFileId(null);
        setPickedColors([]);
        colorClickPosRef.current = null;
      }, 'image/png');
    };
    img.src = fileItem.url;
  };

  const downloadAll = async () => {
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (!done.length) return;
    if (done.length === 1) {
      const f = done[0];
      const url_1 = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url_1;
      a.download = f.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url_1), 10000);
      return;
    }
    const zip = new JSZip();
    for (const f of done) {
      zip.file(f.fileName, f.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url_2 = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url_2;
    a.download = 'removed_backgrounds.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url_2), 10000);
  };

  const hasDone = files.some(f => f.status === 'done');
  const manualFile = files.find(f => f.id === manualFileId);
  const colorFile = files.find(f => f.id === colorFileId);

  const beginAuto = bgRemoval && files.some(f => f.status !== 'processing');

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.bgTitle || 'Remove Background'}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.bgDesc || 'Drop one image or fifty — get clean, transparent PNGs in seconds. Everything runs locally on your device, so your photos never leave your browser.'}</p>
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
                {[
                  { id: 'auto', icon: <Wand2 className="w-4 h-4" />, label: t.bgAuto || 'Auto' },
                  { id: 'manual', icon: <Eraser className="w-4 h-4" />, label: t.bgManual || 'Manual' },
                  { id: 'color', icon: <Pipette className="w-4 h-4" />, label: t.bgColor || 'By Color' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMode(m.id);
                      setManualFileId(null);
                      setColorFileId(null);
                      setPickedColors([]);
                      colorClickPosRef.current = null;
                      if (m.id === 'manual') {
                        const available = files.filter(f => f.status !== 'processing');
                        if (available.length) setManualFileId(available[0].id);
                      } else if (m.id === 'color') {
                        const available = files.filter(f => f.status !== 'processing');
                        if (available.length) setColorFileId(available[0].id);
                      }
                    }}
                    className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 sm:gap-2 ${
                      mode === m.id
                        ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>

              {mode === 'auto' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={processAuto}
                      disabled={processing || !beginAuto}
                      className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                    >
                      {processing || modelLoading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> {modelLoading ? (t.bgLoading || 'Loading AI model...') : (t.bgProcessing || 'Processing...')}</>
                      ) : (
                        <><Wand2 className="w-5 h-5" strokeWidth={1.5}/> {t.bgRemoveAuto || 'Remove All Backgrounds'}</>
                      )}
                    </button>
                    {!bgRemoval && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 self-center">{(t.bgAutoUnavailable || 'Auto mode engine loading — if it fails, try Manual or Color mode.')}</p>
                    )}
                  </div>
                  {(processing || autoProgress > 0) && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${autoProgress}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400 min-w-[3ch] text-right">{autoProgress}%</span>
                      </div>
                      {autoEta != null && autoEta > 0 && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
                          {t.bgEta || 'Estimated'}: ~{autoEta < 60 ? `${autoEta}s` : `${Math.floor(autoEta / 60)}m ${autoEta % 60}s`} {(t.bgRemaining || 'remaining')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {mode === 'manual' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBrushMode('remove')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                        brushMode === 'remove'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ring-2 ring-red-400'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      <Minus className="w-4 h-4" /> {t.bgErase || 'Erase'}
                    </button>
                    <button
                      onClick={() => setBrushMode('restore')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                        brushMode === 'restore'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 ring-2 ring-green-400'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      <Plus className="w-4 h-4" /> {t.bgRestore || 'Restore'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.bgBrushSize || 'Brush'}</label>
                    <input
                      type="range"
                      min="3" max="80"
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                    />
                    <span className="text-sm font-bold text-gray-700 dark:text-slate-300 w-8">{brushSize}px</span>
                  </div>
                  {!manualFileId && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{t.bgManualClickHint || 'Click any image below to start erasing'}</p>
                  )}
                </div>
              )}

              {mode === 'color' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.bgTolerance || 'Tolerance'}</label>
                    <input
                      type="range"
                      min="1" max="200"
                      value={tolerance}
                      onChange={(e) => setTolerance(parseInt(e.target.value))}
                      className="w-28 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                    />
                    <span className="text-sm font-bold text-gray-700 dark:text-slate-300 w-10">{tolerance}</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div className={`w-10 h-5 rounded-full transition-colors relative ${contiguousOnly ? 'bg-purple-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${contiguousOnly ? 'left-5' : 'left-0.5'}`} />
                    </div>
                    <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">{(t.bgContiguous || 'Contiguous only')}</span>
                  </label>
                  <input type="checkbox" checked={contiguousOnly} onChange={(e) => setContiguousOnly(e.target.checked)} className="hidden" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {pickedColors.map((c, i) => (
                      <div key={i} className="w-7 h-7 rounded-lg border-2 border-gray-300 dark:border-slate-600 shadow-sm" style={{ backgroundColor: `rgb(${c.r},${c.g},${c.b})` }} />
                    ))}
                    {pickedColors.length > 0 && (
                      <button onClick={() => setPickedColors([])} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {!colorFileId && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{t.bgColorClickHint || 'Click any image below to pick colors'}</p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={downloadAll}
                  disabled={!hasDone || processing}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" strokeWidth={1.5}/>
                  {files.filter(f => f.status === 'done').length > 1
                    ? `${t.lblZip || 'ZIP'} (${files.filter(f => f.status === 'done').length})`
                    : files.filter(f => f.status === 'done').length === 1
                      ? (t.bgDownload || 'Download')
                      : (t.bgNoResults || 'No results yet')}
                </button>
              </div>
            </div>

            {mode === 'manual' && manualFile && (
              <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col items-center gap-4">
                <div className="flex items-center justify-between w-full">
                  <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300 truncate">{manualFile.file.name}</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={clearManualMask}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 rounded-lg text-sm font-semibold hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {t.bgClear || 'Clear'}
                    </button>
                    <button
                      onClick={applyManualMask}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> {t.bgApply || 'Apply'}
                    </button>
                    <button onClick={closeManualEditor} className="p-1.5 text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="relative inline-block border border-gray-200 dark:border-slate-600 overflow-hidden cursor-crosshair touch-none select-none max-w-full">
                  <canvas ref={canvasRef} className="block max-w-full" style={{ pointerEvents: 'none' }} />
                  <canvas
                    ref={maskCanvasRef}
                    className="absolute inset-0 max-w-full"
                    onPointerDown={handleManualPointerDown}
                    onPointerMove={handleManualPointerMove}
                    onPointerUp={handleManualPointerUp}
                    onPointerLeave={handleManualPointerUp}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center max-w-md">{t.bgManualHint || 'Paint over areas to remove (red brush) or restore (green brush). Click Apply when done.'}</p>
              </div>
            )}

            {mode === 'color' && colorFile && (
              <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col items-center gap-4">
                <div className="flex items-center justify-between w-full">
                  <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300 truncate">{colorFile.file.name}</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={processColor}
                      disabled={processing || !pickedColors.length}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1"
                    >
                      {processing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.bgProcessing || 'Processing...'}</> : <><Check className="w-3.5 h-3.5" /> {t.bgRemoveColors || 'Remove Colors'}</>}
                    </button>
                    <button onClick={closeColorPicker} className="p-1.5 text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="relative inline-block cursor-crosshair max-w-full">
                  <img
                    src={colorFile.url}
                    alt=""
                    className="max-w-full max-h-[500px] border border-gray-200 dark:border-slate-600"
                    onClick={handleColorPick}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center max-w-md">{t.bgColorHint || 'Click on colors in the image to add them to the removal list. Click again to deselect. Adjust tolerance and press Remove Colors.'}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {files.map(item => {
                const isPending = item.status === 'pending';
                const isManualTarget = mode === 'manual' && isPending;
                const isColorTarget = mode === 'color' && isPending;
                const isActive = item.id === manualFileId || item.id === colorFileId;
                const cardClickable = isManualTarget || isColorTarget;
                const handleCardClick = () => {
                  if (isManualTarget) openManualEditor(item.id);
                  else if (isColorTarget) openColorPicker(item.id);
                };
                return (
                <div
                  key={item.id}
                  onClick={cardClickable ? handleCardClick : undefined}
                  className={`bg-gray-50 dark:bg-slate-900 rounded-2xl p-4 flex items-center gap-4 border soft-shadow transition-all
                    ${item.status === 'done' ? 'border-green-500' : item.status === 'error' ? 'border-red-400' : isActive ? 'border-purple-400 dark:border-purple-500 ring-1 ring-purple-300 dark:ring-purple-600' : 'border-gray-100 dark:border-slate-700'}
                    ${cardClickable ? 'cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-md hover:scale-[1.01]' : ''}`}
                >
                  <div className="w-16 h-16 overflow-hidden bg-gray-200 dark:bg-slate-800 flex-shrink-0 relative" style={{ backgroundImage: item.resultUrl ? 'none' : undefined }}>
                    {item.resultUrl ? (
                      <img src={item.resultUrl} className="w-full h-full object-contain" alt="" style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 12px 12px' }} />
                    ) : (
                      <img src={item.url} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.file.name}</h4>
                    <div className="text-xs mt-1">
                      {item.status === 'done' && (
                        <span className="text-green-500 font-bold">{t.bgDone || 'Done'} {item.newSize ? `(${fmtBytes(item.newSize)})` : ''}</span>
                      )}
                      {item.status === 'processing' && (
                        <div className="flex flex-col gap-1">
                          <span className="text-purple-500 animate-pulse font-semibold text-xs">{t.bgProcessing || 'Processing...'}</span>
                          {item.progress != null && (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden max-w-[120px]">
                                <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                              </div>
                              <span className="text-[10px] text-purple-500 font-semibold">{item.progress}%</span>
                            </div>
                          )}
                        </div>
                      )}
                      {item.status === 'error' && <span className="text-red-500 font-semibold">{t.lblError || 'Error'}</span>}
                      {item.status === 'pending' && (
                        <span className="text-gray-400 dark:text-slate-500">
                          {isManualTarget ? (t.bgCardManualHint || 'Click to erase background') : isColorTarget ? (t.bgCardColorHint || 'Click to pick colors') : fmtBytes(item.origSize)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(item.id); }} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-5 h-5" strokeWidth={1.5}/>
                  </button>
                </div>
                );
              })}
            </div>

            <button
              onClick={() => { setFiles([]); setWorkspaceVisible(false); setManualFileId(null); setColorFileId(null); setPickedColors([]); }}
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
