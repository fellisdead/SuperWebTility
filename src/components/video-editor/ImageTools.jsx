'use client';

import { Image, Upload, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export default function ImageTools({ images, setImages, currentTime, t }) {
  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newImages = files
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        file: f,
        url: URL.createObjectURL(f),
        x: 200,
        y: 200,
        width: 300,
        height: 0,
        opacity: 1,
        startTime: 0,
        endTime: 0,
      }));
    setImages(prev => [...prev, ...newImages]);
    e.target.value = '';
  };

  const updateProp = (id, prop, value) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, [prop]: value } : img));
  };

  const removeImage = (id) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter(i => i.id !== id);
    });
  };

  const moveLayer = (id, direction) => {
    setImages(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-center gap-2 w-full p-5 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
        <Upload className="w-5 h-5 text-gray-400" strokeWidth={2} />
        <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">{t.veUploadImages}</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      </label>

      {images.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-slate-500">{t.veNoImages}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-400 dark:text-slate-500 italic">
            Drag images directly on the preview. Use sliders for fine-tuning.
          </p>
          {images.map((img) => (
            <div key={img.id} className="p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-blue-500" strokeWidth={2} />
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-300 truncate max-w-[120px]">
                    {img.file.name}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => moveLayer(img.id, -1)} title="Send backward"
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400">
                    <ArrowDown className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => moveLayer(img.id, 1)} title="Bring forward"
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400">
                    <ArrowUp className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => removeImage(img.id)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t.veXPos}</label>
                  <input type="range" min={0} max={1920} value={img.x} onChange={e => updateProp(img.id, 'x', +e.target.value)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{img.x}px</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t.veYPos}</label>
                  <input type="range" min={0} max={1080} value={img.y} onChange={e => updateProp(img.id, 'y', +e.target.value)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{img.y}px</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t.veWidth}</label>
                  <input type="range" min={20} max={1920} value={img.width} onChange={e => updateProp(img.id, 'width', +e.target.value)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{img.width}px</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t.veOpacity}</label>
                  <input type="range" min={0} max={100} value={Math.round(img.opacity * 100)} onChange={e => updateProp(img.id, 'opacity', +e.target.value / 100)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{Math.round(img.opacity * 100)}%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200 dark:border-slate-700">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t.veStart} ({formatTime(img.startTime)})</label>
                  <button onClick={() => updateProp(img.id, 'startTime', currentTime || 0)} className="text-[10px] font-bold text-blue-500 hover:text-blue-400">
                    Set current time
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t.veEnd} ({formatTime(img.endTime)})</label>
                  <button onClick={() => updateProp(img.id, 'endTime', currentTime || 0)} className="text-[10px] font-bold text-blue-500 hover:text-blue-400">
                    Set current time
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
