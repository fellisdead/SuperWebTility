'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, Download, TrendingUp, Zap, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import JSZip from 'jszip';

const MODEL_URL = 'https://huggingface.co/bukuroo/RealESRGAN-ONNX/resolve/main/real-esrgan-x4plus-128.onnx';
const TILE = 128;
const OVERLAP = 16;
const MAX_FILES = 5;

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${['B','KB','MB'][i]}`;
};

function createWorker(useWebGpu) {
  const ep = useWebGpu
    ? "[{name:'webgpu',preferredLayout:'NCHW'},'wasm']"
    : "['wasm']";
  const code = `
    importScripts(self.location.origin + '/onnx/ort.all.min.js');
    let s = null;
    let inName, outName;
    ort.env.wasm.wasmPaths = self.location.origin + '/onnx/';
    ort.env.wasm.numThreads = 2;

    self.onmessage = async (e) => {
      try {
        if (e.data.type === 'init') {
          s = await ort.InferenceSession.create(e.data.model, {
            executionProviders: ${ep},
            graphOptimizationLevel: 'all',
          });
          inName = s.inputNames[0];
          outName = s.outputNames[0];
          self.postMessage({ type: 'ready' });
        }
        else if (e.data.type === 'infer') {
          const { rgb, w, h } = e.data;
          const t = new ort.Tensor('float32', new Float32Array(rgb), [1, 3, h, w]);
          const r = await s.run({ [inName]: t });
          const o = r[outName];
          const outW = o.dims[3];
          const outH = o.dims[2];
          const buf = new Float32Array(o.data).buffer;
          self.postMessage({ type: 'result', outW, outH, buf }, [buf]);
          t.dispose();
          o.dispose();
        }
      } catch (err) {
        self.postMessage({ type: 'error', msg: err.message });
      }
    };
  `;
  return new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
}

export default function Upscale() {
  const { t } = useLanguage();
  const [engineStatus, setEngineStatus] = useState('idle');
  const [useGpu, setUseGpu] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelETA, setModelETA] = useState(null);
  const [files, setFiles] = useState([]);
  const [scale, setScale] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [upscaleProgress, setUpscaleProgress] = useState(0);
  const [upscaleETA, setUpscaleETA] = useState(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const workerRef = useRef(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    const hasGpu = typeof navigator !== 'undefined' && !!navigator.gpu;
    setUseGpu(hasGpu);
    initEngine(hasGpu);
    return () => { if (workerRef.current) workerRef.current.terminate(); };
  }, []);

  const initEngine = async (hasGpu) => {
    setEngineStatus('loading');
    setErrorMsg(null);
    try {
      const startTime = Date.now();
      const response = await fetch(MODEL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length') || 33600000;
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const pct = Math.round((received / contentLength) * 100);
        setModelProgress(pct);

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 0.5 && received > 0) {
          const speed = received / elapsed;
          const remaining = (contentLength - received) / speed;
          setModelETA(remaining < 1 ? '< 1s' : remaining < 60 ? `${Math.round(remaining)}s` : `${Math.round(remaining / 60)}m`);
        }
      }

      const full = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { full.set(c, off); off += c.length; }

      const w = createWorker(hasGpu);
      workerRef.current = w;

      await new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          if (e.data.type === 'ready') resolve();
          if (e.data.type === 'error') reject(new Error(e.data.msg));
        };
        w.onerror = (e) => reject(new Error(e.message));
        w.postMessage({ type: 'init', model: full.buffer }, [full.buffer]);
      });

      setEngineStatus('ready');
    } catch (err) {
      console.error('Engine init:', err);
      setEngineStatus('error');
      setErrorMsg('Failed to load AI engine: ' + err.message);
    }
  };

  const handleFiles = (e) => {
    const raw = e.target?.files || e.dataTransfer?.files;
    const selected = Array.from(raw || []);
    if (!selected.length) return;
    if (files.length >= MAX_FILES) { setErrorMsg(t.upscaleMaxFiles || 'Maximum 5 images'); return; }
    const toAdd = selected.slice(0, MAX_FILES - files.length);
    const newFiles = toAdd.map(file => ({
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
    setFiles(prev => [...prev, ...newFiles]);
    setWorkspaceVisible(true);
    setErrorMsg(null);
    newFiles.forEach((nf) => {
      const img = new Image();
      img.onload = () => setFiles(prev => prev.map(f =>
        f.id === nf.id ? { ...f, origW: img.naturalWidth, origH: img.naturalHeight } : f
      ));
      img.src = nf.url;
    });
  };

  const removeFile = (id) => {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (!next.length) setWorkspaceVisible(false);
      return next;
    });
  };

  const getImageData = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve({ imageData: ctx.getImageData(0, 0, img.width, img.height), w: img.width, h: img.height });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });

  const imgDataToRGB = (imageData, w, h) => {
    const rgb = new Float32Array(3 * w * h);
    const px = imageData.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = y * w + x;
        rgb[0 * h * w + di] = px[si] / 255;
        rgb[1 * h * w + di] = px[si + 1] / 255;
        rgb[2 * h * w + di] = px[si + 2] / 255;
      }
    }
    return rgb;
  };

  const tensorToImageData = (data, outH, outW) => {
    const rgba = new Uint8ClampedArray(outW * outH * 4);
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const di = (y * outW + x);
        const si = y * outW + x;
        rgba[di * 4] = clamp(Math.round(data[0 * outH * outW + si] * 255));
        rgba[di * 4 + 1] = clamp(Math.round(data[1 * outH * outW + si] * 255));
        rgba[di * 4 + 2] = clamp(Math.round(data[2 * outH * outW + si] * 255));
        rgba[di * 4 + 3] = 255;
      }
    }
    return new ImageData(rgba, outW, outH);
  };

  const imgDataToBlob = (imageData) => new Promise(resolve => {
    const c = document.createElement('canvas');
    c.width = imageData.width; c.height = imageData.height;
    c.getContext('2d').putImageData(imageData, 0, 0);
    c.toBlob(resolve, 'image/png');
  });

  const inferTile = (w, rgb, inW, inH, outW, outH) => new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      if (e.data.type === 'result') {
        const arr = new Float32Array(e.data.buf);
        resolve(tensorToImageData(arr, e.data.outH, e.data.outW));
      }
      if (e.data.type === 'error') reject(new Error(e.data.msg));
    };
    w.postMessage({ type: 'infer', rgb: rgb.buffer, w: inW, h: inH }, [rgb.buffer]);
  });

  const upscaleImage = async (worker, file, passes, onProgress) => {
    let { imageData, w, h } = await getImageData(file);
    for (let p = 0; p < passes; p++) {
      const inW = w, inH = h;
      const padW = Math.ceil(inW / TILE) * TILE;
      const padH = Math.ceil(inH / TILE) * TILE;
      const outW = padW * 4, outH = padH * 4;
      const tilesX = padW / TILE, tilesY = padH / TILE;
      const total = tilesX * tilesY;
      let done = 0;

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = padW; srcCanvas.height = padH;
      const sctx = srcCanvas.getContext('2d');
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = inW; tmpCanvas.height = inH;
      tmpCanvas.getContext('2d').putImageData(imageData, 0, 0);
      sctx.drawImage(tmpCanvas, 0, 0);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW; outCanvas.height = outH;
      const octx = outCanvas.getContext('2d');

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const sx = tx * TILE, sy = ty * TILE;
          const tileCanvas = document.createElement('canvas');
          tileCanvas.width = TILE; tileCanvas.height = TILE;
          const tctx = tileCanvas.getContext('2d');
          tctx.drawImage(srcCanvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
          const td = tctx.getImageData(0, 0, TILE, TILE);
          const rgb = imgDataToRGB(td, TILE, TILE);
          const upTile = await inferTile(worker, rgb, TILE, TILE, TILE * 4, TILE * 4);
          octx.putImageData(upTile, sx * 4, sy * 4);
          done++;
          if (onProgress) onProgress(done, total);
        }
      }
      imageData = octx.getImageData(0, 0, inW * 4, inH * 4);
      w = inW * 4; h = inH * 4;
    }
    return { imageData, w, h };
  };

  const upscaleAll = async () => {
    setProcessing(true);
    setErrorMsg(null);
    setUpscaleProgress(0);
    setUpscaleETA(null);
    const worker = workerRef.current;
    const passes = 1;
    const needsDownscale = scale < 4;
    const pending = files.filter(f => f.status !== 'processing');
    const totalFiles = pending.length;
    let fileIdx = 0;

    for (const item of pending) {
      fileIdx++;
      setCurrentFile(item.file.name);
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));

      const fileStart = Date.now();
      const onProgress = (done, total) => {
        const pct = Math.round((done / total) * 100);
        setUpscaleProgress(pct);
        const elapsed = (Date.now() - fileStart) / 1000;
        if (elapsed > 0.3 && done > 0 && done < total) {
          const perTile = elapsed / done;
          const remaining = (total - done) * perTile;
          setUpscaleETA(remaining < 1 ? '< 1s' : remaining < 60 ? `${Math.round(remaining)}s` : `${Math.round(remaining / 60)}m`);
        } else if (done === total) {
          setUpscaleProgress(100);
          setUpscaleETA(null);
        }
      };

      try {
        const { imageData, w, h } = await upscaleImage(worker, item.file, passes, onProgress);
        let finalImageData = imageData;
        let finalW = w;
        let finalH = h;

        if (needsDownscale) {
          const targetW = item.origW * scale;
          const targetH = item.origH * scale;
          const c = document.createElement('canvas');
          c.width = targetW;
          c.height = targetH;
          const ctx = c.getContext('2d');
          const src = document.createElement('canvas');
          src.width = w;
          src.height = h;
          src.getContext('2d').putImageData(imageData, 0, 0);
          ctx.drawImage(src, 0, 0, targetW, targetH);
          finalImageData = ctx.getImageData(0, 0, targetW, targetH);
          finalW = targetW;
          finalH = targetH;
        }

        const blob = await imgDataToBlob(finalImageData);
        const resultUrl = URL.createObjectURL(blob);
        const baseName = item.file.name.replace(/\.[^.]+$/, '');
        const fileName = `${baseName}_${scale}x.png`;
        setFiles(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: 'done', newSize: blob.size, blob, fileName, resultUrl } : f
        ));
      } catch (err) {
        console.error('Upscale error:', err);
        setErrorMsg('Error: ' + err.message);
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
      }
    }
    setCurrentFile(null);
    setUpscaleProgress(0);
    setUpscaleETA(null);
    setProcessing(false);
  };

  const downloadAll = async () => {
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (!done.length) return;
    if (done.length === 1) {
      const f = done[0];
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a'); a.href = url; a.download = f.fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }
    const zip = new JSZip();
    for (const f of done) zip.file(f.fileName, f.blob);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a'); a.href = url; a.download = 'upscaled_images.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const hasDone = files.some(f => f.status === 'done');
  const engineReady = engineStatus === 'ready';

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.upscaleTitle || 'Upscale Image'}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.upscaleDesc || 'Enhance low-quality or compressed photos using Real-ESRGAN AI. Runs entirely on your device — processing time depends on your hardware. Drop up to 5 images.'}</p>
        </div>

        {!engineReady && engineStatus !== 'error' && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl text-blue-600 dark:text-blue-400 text-sm font-semibold">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                Downloading Real-ESRGAN model
              </span>
              <span>{modelProgress}%{modelETA ? ` · ${modelETA}` : ''}</span>
            </div>
            <div className="w-full h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${modelProgress}%` }} />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
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
            <p className="text-gray-400 dark:text-slate-500 text-sm mt-2">Max 5 images · Real-ESRGAN x2</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8 w-full">
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-6">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Real-ESRGAN
                </span>
                <span className={`px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 ${useGpu ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}`}>
                  {useGpu ? 'GPU' : 'CPU'}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t.lblScale || 'Scale'}</label>
                <div className="flex gap-2">
                  {[1, 2, 4].map((s) => (
                    <button
                      key={s}
                      onClick={() => setScale(s)}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        scale === s
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {currentFile && (
                <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {currentFile}
                    </span>
                    <span>{upscaleProgress}%{upscaleETA ? ` · ${upscaleETA}` : ''}</span>
                  </div>
                  <div className="w-full h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${upscaleProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={upscaleAll}
                  disabled={processing || !engineReady}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> {t.lblUpscaling || 'Upscaling...'}</>
                  ) : !engineReady ? (
                    <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5}/> Loading model...</>
                  ) : (
                    <><TrendingUp className="w-5 h-5" strokeWidth={1.5}/> {t.btnUpscale || 'Upscale All'}</>
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
                <div key={item.id} className={`bg-gray-50 dark:bg-slate-900 rounded-2xl p-4 flex items-center gap-4 border soft-shadow transition-all ${
                  item.status === 'done' ? 'border-green-500' : item.status === 'error' ? 'border-red-400' : 'border-gray-100 dark:border-slate-700'}`}>
                  <div className="w-16 h-16 overflow-hidden bg-gray-200 dark:bg-slate-800 flex-shrink-0">
                    <img src={item.resultUrl || item.url} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.file.name}</h4>
                    <p className="text-xs mt-1">
                      {item.status === 'done' && (
                        <span className="text-green-500 font-bold flex items-center gap-1">
                          {item.origW}×{item.origH} → {item.origW * scale}×{item.origH * scale} {item.newSize ? `(${fmtBytes(item.newSize)})` : ''}
                        </span>
                      )}
                      {item.status === 'processing' && <span className="text-blue-500 animate-pulse">{t.lblUpscaling || 'Upscaling...'}</span>}
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

            {files.length < MAX_FILES && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e); }}
                className="w-full bg-white dark:bg-slate-800 rounded-[20px] p-8 flex flex-col items-center justify-center cursor-pointer card-shadow text-center relative overflow-hidden group border-2 border-dashed border-gray-200 dark:border-slate-700"
              >
                <input type="file" onChange={handleFiles} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" multiple accept="image/*" />
                <div className="text-gray-400 dark:text-slate-500 mb-3 transition-transform group-hover:scale-110">
                  <Upload className="w-10 h-10" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">{t.dropMore || 'Drop more images'} ({files.length}/{MAX_FILES})</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
