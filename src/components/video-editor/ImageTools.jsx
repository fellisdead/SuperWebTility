'use client';

import { Image, Upload, Trash2 } from 'lucide-react';

export default function ImageTools({ images, setImages }) {
  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newImages = files
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({
        id: crypto.randomUUID(),
        file: f,
        url: URL.createObjectURL(f),
        x: 100,
        y: 100,
        width: 200,
        height: 0,
        opacity: 1,
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

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-center gap-2 w-full p-5 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
        <Upload className="w-5 h-5 text-gray-400" strokeWidth={2} />
        <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">Upload Images</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      </label>

      {images.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-slate-500">No images added yet</p>
      ) : (
        <div className="space-y-4">
          {images.map((img, i) => (
            <div key={img.id} className="p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-blue-500" strokeWidth={2} />
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-300 truncate max-w-[180px]">
                    {img.file.name}
                  </span>
                </div>
                <button onClick={() => removeImage(img.id)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">X Position</label>
                  <input type="range" min={0} max={1920} value={img.x} onChange={e => updateProp(img.id, 'x', +e.target.value)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{img.x}px</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Y Position</label>
                  <input type="range" min={0} max={1080} value={img.y} onChange={e => updateProp(img.id, 'y', +e.target.value)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{img.y}px</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Width</label>
                  <input type="range" min={20} max={1920} value={img.width} onChange={e => updateProp(img.id, 'width', +e.target.value)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{img.width}px</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Opacity</label>
                  <input type="range" min={0} max={100} value={Math.round(img.opacity * 100)} onChange={e => updateProp(img.id, 'opacity', +e.target.value / 100)}
                    className="w-full accent-blue-500" />
                  <span className="text-xs text-gray-400">{Math.round(img.opacity * 100)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
