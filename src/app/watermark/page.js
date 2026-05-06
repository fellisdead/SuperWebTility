'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Loader2, Download, Type, ImageIcon, Stamp, Eye } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import JSZip from 'jszip';

const POSITIONS = [
  { value: 'nw', label: '↖' },
  { value: 'n',  label: '↑' },
  { value: 'ne', label: '↗' },
  { value: 'w',  label: '←' },
  { value: 'c',  label: '·' },
  { value: 'e',  label: '→' },
  { value: 'sw', label: '↙' },
  { value: 's',  label: '↓' },
  { value: 'se', label: '↘' },
];

const POSITION_LABELS = {
  nw: 'Top Left', n: 'Top Center', ne: 'Top Right',
  w: 'Center Left', c: 'Center', e: 'Center Right',
  sw: 'Bottom Left', s: 'Bottom Center', se: 'Bottom Right',
};

const calcPosition = (imgW, imgH, wmW, wmH, position, margin = 30) => {
  const map = {
    nw: { x: margin, y: margin },
    n:  { x: (imgW - wmW) / 2, y: margin },
    ne: { x: imgW - wmW - margin, y: margin },
    w:  { x: margin, y: (imgH - wmH) / 2 },
    c:  { x: (imgW - wmW) / 2, y: (imgH - wmH) / 2 },
    e:  { x: imgW - wmW - margin, y: (imgH - wmH) / 2 },
    sw: { x: margin, y: imgH - wmH - margin },
    s:  { x: (imgW - wmW) / 2, y: imgH - wmH - margin },
    se: { x: imgW - wmW - margin, y: imgH - wmH - margin },
  };
  return map[position] || map.c;
};

const fmtBytes = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const drawWatermarkOnCtx = (ctx, canvasW, canvasH, config) => {
  ctx.save();
  ctx.globalAlpha = config.opacity / 100;

  if (config.type === 'text' && config.text.trim()) {
    ctx.font = `bold ${config.fontSize}px ${config.fontFamily}`;
    ctx.fillStyle = config.color;
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText(config.text);
    const tw = metrics.width;
    const th = config.fontSize * 1.2;

    if (config.tile) {
      const spacingX = tw + Math.max(tw * 0.5, config.fontSize * 3);
      const spacingY = th * 1.8;
      for (let y = -th; y < canvasH + th; y += spacingY) {
        for (let x = -tw; x < canvasW + tw; x += spacingX) {
          ctx.save();
          if (config.rotation !== 0) {
            ctx.translate(x + tw / 2, y + th / 2);
            ctx.rotate((config.rotation * Math.PI) / 180);
            ctx.translate(-(x + tw / 2), -(y + th / 2));
          }
          ctx.fillText(config.text, x, y);
          ctx.restore();
        }
      }
    } else {
      const pos = calcPosition(canvasW, canvasH, tw, th, config.position);
      if (config.rotation !== 0) {
        ctx.translate(pos.x + tw / 2, pos.y + th / 2);
        ctx.rotate((config.rotation * Math.PI) / 180);
        ctx.translate(-(pos.x + tw / 2), -(pos.y + th / 2));
      }
      ctx.fillText(config.text, pos.x, pos.y);
    }
  } else if (config.type === 'logo' && config.logoImg) {
    const logoImg = config.logoImg;
    const lw = logoImg.naturalWidth * (config.logoScale / 100);
    const lh = logoImg.naturalHeight * (config.logoScale / 100);

    if (config.tile) {
      const spacingX = lw + Math.max(lw * 0.3, 40);
      const spacingY = lh + Math.max(lh * 0.3, 40);
      for (let y = -lh; y < canvasH + lh; y += spacingY) {
        for (let x = -lw; x < canvasW + lw; x += spacingX) {
          ctx.save();
          if (config.rotation !== 0) {
            ctx.translate(x + lw / 2, y + lh / 2);
            ctx.rotate((config.rotation * Math.PI) / 180);
            ctx.translate(-(x + lw / 2), -(y + lh / 2));
          }
          ctx.drawImage(logoImg, x, y, lw, lh);
          ctx.restore();
        }
      }
    } else {
      const pos = calcPosition(canvasW, canvasH, lw, lh, config.position);
      if (config.rotation !== 0) {
        ctx.translate(pos.x + lw / 2, pos.y + lh / 2);
        ctx.rotate((config.rotation * Math.PI) / 180);
        ctx.translate(-(pos.x + lw / 2), -(pos.y + lh / 2));
      }
      ctx.drawImage(logoImg, pos.x, pos.y, lw, lh);
    }
  }

  ctx.restore();
};

export default function Watermark() {
  const { t } = useLanguage();
  const [files, setFiles] = useState([]);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Watermark config
  const [wmType, setWmType] = useState('text');
  const [wmText, setWmText] = useState('');
  const [wmFontSize, setWmFontSize] = useState(48);
  const [wmColor, setWmColor] = useState('#ffffff');
  const [wmOpacity, setWmOpacity] = useState(50);
  const [wmPosition, setWmPosition] = useState('se');
  const [wmFontFamily, setWmFontFamily] = useState('Inter, sans-serif');
  const [wmRotation, setWmRotation] = useState(0);
  const [wmTile, setWmTile] = useState(false);

  // Logo state
  const [logoFile, setLogoFile] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoScale, setLogoScale] = useState(25);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const logoImgRef = useRef(null);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewGen, setPreviewGen] = useState(0);

  const getWatermarkConfig = useCallback(() => ({
    type: wmType,
    text: wmText,
    fontSize: wmFontSize,
    fontFamily: wmFontFamily,
    color: wmColor,
    opacity: wmOpacity,
    position: wmPosition,
    rotation: wmRotation,
    tile: wmTile,
    logoImg: logoImgRef.current,
    logoScale,
  }), [wmType, wmText, wmFontSize, wmFontFamily, wmColor, wmOpacity, wmPosition, wmRotation, wmTile, logoScale]);

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

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoFile(file);
    setLogoUrl(url);
    setLogoLoaded(false);
    const img = new Image();
    img.onload = () => {
      logoImgRef.current = img;
      setLogoLoaded(true);
      setPreviewGen(p => p + 1);
    };
    img.src = url;
  };

  const applyWatermarkToImage = (sourceImg) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = sourceImg.naturalWidth;
      canvas.height = sourceImg.naturalHeight;

      ctx.drawImage(sourceImg, 0, 0);
      drawWatermarkOnCtx(ctx, canvas.width, canvas.height, getWatermarkConfig());

      canvas.toBlob((blob) => {
        const resultUrl = URL.createObjectURL(blob);
        resolve({ blob, resultUrl });
      }, 'image/png');
    });
  };

  // Live preview
  useEffect(() => {
    const firstFile = files[0];
    if (!firstFile) {
      setPreviewUrl(null);
      return;
    }

    const config = getWatermarkConfig();
    const hasWatermark = (config.type === 'text' && config.text.trim()) || (config.type === 'logo' && config.logoImg);
    if (!hasWatermark) {
      setPreviewUrl(firstFile.url);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        const maxW = 800;
        let cw = img.naturalWidth;
        let ch = img.naturalHeight;
        if (cw > maxW) {
          ch = Math.round(ch * (maxW / cw));
          cw = maxW;
        }
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        drawWatermarkOnCtx(ctx, cw, ch, config);
        setPreviewUrl(canvas.toDataURL('image/png'));
      };
      img.src = firstFile.url;
    }, 150);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [files, getWatermarkConfig, previewGen, logoLoaded]);

  const applyAll = async () => {
    const config = getWatermarkConfig();
    if ((config.type === 'text' && !config.text.trim()) || (config.type === 'logo' && !config.logoImg)) {
      setErrorMsg('Please add a watermark text or upload a logo first.');
      return;
    }
    setProcessing(true);
    setErrorMsg(null);

    const pending = files.filter(f => f.status !== 'processing');

    for (const item of pending) {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
      try {
        const sourceImg = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = item.url;
        });

        const { blob, resultUrl } = await applyWatermarkToImage(sourceImg);
        const baseName = item.file.name.replace(/\.[^.]+$/, '');
        const fileName = `${baseName}_watermarked.png`;

        setFiles(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: 'done', newSize: blob.size, blob, fileName, resultUrl } : f
        ));
      } catch (err) {
        console.error('Watermark error:', err);
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
    a.download = 'watermarked_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const hasDone = files.some(f => f.status === 'done');
  const config = getWatermarkConfig();
  const canApply = (config.type === 'text' && config.text.trim()) || (config.type === 'logo' && config.logoImg);
  const firstFile = files[0];

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">
            {t.wmTitle || 'Watermark Images'}
          </h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">
            {t.wmDesc || 'Drop your photos, type your name or upload a logo, and download every image back with the same watermark applied. Free, no sign-up, and your photos and logo never leave your browser.'}
          </p>
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
            {/* Watermark config + Preview side by side on desktop */}
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 bg-white dark:bg-slate-800 rounded-[24px] p-8 card-shadow flex flex-col gap-6">
                {/* Type tabs */}
                <div className="flex gap-2 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-2xl self-start">
                  <button
                    onClick={() => setWmType('text')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                      wmType === 'text'
                        ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Type className="w-4 h-4" strokeWidth={2} /> {t.wmTypeText || 'Text'}
                  </button>
                  <button
                    onClick={() => setWmType('logo')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                      wmType === 'logo'
                        ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" strokeWidth={2} /> {t.wmTypeLogo || 'Logo'}
                  </button>
                </div>

                {wmType === 'text' ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                        {t.wmTextLabel || 'Watermark Text'}
                      </label>
                      <input
                        type="text"
                        value={wmText}
                        onChange={(e) => setWmText(e.target.value)}
                        placeholder={t.wmTextPlaceholder || '© Your Name'}
                        className="w-full sm:w-96 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                          {t.wmFontSize || 'Font Size'}
                        </label>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{wmFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="12" max="200"
                        value={wmFontSize}
                        onChange={(e) => setWmFontSize(parseInt(e.target.value))}
                        className="w-full sm:w-80 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                        {t.wmFontFamily || 'Font Style'}
                      </label>
                      <select
                        value={wmFontFamily}
                        onChange={(e) => setWmFontFamily(e.target.value)}
                        className="w-full sm:w-80 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                      >
                        <option value="Inter, -apple-system, sans-serif">Inter (Sans-serif)</option>
                        <option value="Georgia, 'Times New Roman', serif">Georgia (Serif)</option>
                        <option value="'Courier New', Courier, monospace">Courier New (Monospace)</option>
                        <option value="'Brush Script MT', 'Comic Sans MS', cursive">Brush Script (Cursive)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                        {t.wmColor || 'Color'}
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={wmColor}
                          onChange={(e) => setWmColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border-2 border-gray-200 dark:border-slate-600 cursor-pointer bg-transparent"
                        />
                        <div className="flex gap-1.5">
                          {['#ffffff', '#000000', '#888888', '#ff0000', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6'].map(c => (
                            <button
                              key={c}
                              onClick={() => setWmColor(c)}
                              className="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 active:scale-95"
                              style={{
                                backgroundColor: c,
                                borderColor: wmColor === c ? '#3b82f6' : c === '#ffffff' ? '#d1d5db' : 'transparent',
                                boxShadow: wmColor === c ? '0 0 0 2px #3b82f6' : 'none',
                              }}
                              title={c}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                        {t.wmLogoUpload || 'Upload Logo'}
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="bg-gray-50 dark:bg-slate-900 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl px-6 py-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex items-center gap-3">
                          <Upload className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                          <span className="text-sm font-medium text-gray-600 dark:text-slate-400">
                            {logoFile ? logoFile.name : 'Choose file'}
                          </span>
                          <input type="file" onChange={handleLogoUpload} accept="image/*" className="hidden" />
                        </label>
                        {logoUrl && (
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600">
                            <img src={logoUrl} className="w-full h-full object-contain" alt="Logo preview" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                          {t.wmLogoScale || 'Logo Size'}
                        </label>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{logoScale}%</span>
                      </div>
                      <input
                        type="range"
                        min="5" max="100"
                        value={logoScale}
                        onChange={(e) => setLogoScale(parseInt(e.target.value))}
                        className="w-full sm:w-80 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                      />
                    </div>
                  </>
                )}

                {/* Opacity */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      {t.wmOpacity || 'Opacity'}
                    </label>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{wmOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="5" max="100"
                    value={wmOpacity}
                    onChange={(e) => setWmOpacity(parseInt(e.target.value))}
                    className="w-full sm:w-80 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                  />
                </div>

                {/* Rotation */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      {t.wmRotation || 'Rotation'}
                    </label>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{wmRotation}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180" max="180"
                    value={wmRotation}
                    onChange={(e) => setWmRotation(parseInt(e.target.value))}
                    className="w-full sm:w-80 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                  />
                  <div className="flex gap-2">
                    {[-45, -30, 0, 30, 45].map(deg => (
                      <button
                        key={deg}
                        onClick={() => setWmRotation(deg)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                          wmRotation === deg
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position grid */}
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    {t.wmPosition || 'Position'}
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="grid grid-cols-3 gap-1.5 bg-gray-100 dark:bg-slate-900 p-2 rounded-xl">
                      {POSITIONS.map(p => (
                        <button
                          key={p.value}
                          disabled={wmTile}
                          onClick={() => { setWmPosition(p.value); setWmTile(false); }}
                          className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
                            wmPosition === p.value && !wmTile
                              ? 'bg-blue-600 text-white shadow-md scale-110'
                              : 'text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                          }`}
                          title={POSITION_LABELS[p.value]}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setWmTile(!wmTile)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          wmTile
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {t.wmTile || 'Tile'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview Panel */}
              <div className="lg:w-[400px] xl:w-[480px] bg-white dark:bg-slate-800 rounded-[24px] p-6 card-shadow flex flex-col gap-4 min-h-[200px]">
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                  <Eye className="w-5 h-5" strokeWidth={1.5} />
                  <span className="text-sm font-bold uppercase tracking-wider">{t.wmPreview || 'Preview'}</span>
                </div>
                <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-slate-900 rounded-2xl overflow-hidden min-h-[180px]">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      className="max-w-full max-h-[400px] object-contain"
                      alt="Watermark preview"
                    />
                  ) : !firstFile ? (
                    <span className="text-sm text-gray-400 dark:text-slate-500 font-medium">
                      {t.wmPreviewEmpty || 'Drop images to see a preview'}
                    </span>
                  ) : (
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" strokeWidth={1.5} />
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 w-full sm:w-auto">
              <button
                onClick={applyAll}
                disabled={processing || !canApply}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} /> {t.wmApplying || 'Applying...'}</>
                ) : (
                  <><Stamp className="w-5 h-5" strokeWidth={1.5} /> {t.wmApply || 'Apply Watermark'}</>
                )}
              </button>
              <button
                onClick={downloadAll}
                disabled={!hasDone || processing}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" strokeWidth={1.5} />
                {files.filter(f => f.status === 'done').length > 1 ? 'ZIP' : ''}
              </button>
            </div>

            {/* File cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {files.map(item => (
                <div key={item.id} className={`bg-gray-50 dark:bg-slate-900 rounded-2xl p-4 flex items-center gap-4 border soft-shadow transition-all ${
                  item.status === 'done' ? 'border-green-500' : item.status === 'error' ? 'border-red-400' : 'border-gray-100 dark:border-slate-700'
                }`}>
                  <div className="w-16 h-16 overflow-hidden bg-gray-200 dark:bg-slate-800 flex-shrink-0 rounded-lg">
                    <img src={item.resultUrl || item.url} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.file.name}</h4>
                    <p className="text-xs mt-1">
                      {item.status === 'done' && (
                        <span className="text-green-500 font-bold flex items-center gap-1">
                          {t.wmDone || 'Watermarked'} {item.newSize ? `(${fmtBytes(item.newSize)})` : ''}
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="text-blue-500 animate-pulse">{t.wmApplying || 'Applying...'}</span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-500 font-semibold">{t.lblError || 'Error'}</span>
                      )}
                      {item.status === 'pending' && (
                        <span className="text-gray-400 dark:text-slate-500">{fmtBytes(item.origSize)}</span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => removeFile(item.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setFiles([]); setWorkspaceVisible(false); setPreviewUrl(null); }}
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
