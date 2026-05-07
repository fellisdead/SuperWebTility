'use client';

import { Upload, Trash2, Video } from 'lucide-react';

export default function VideoTools({ videos, setVideos, activeVideo, setActiveVideo, t }) {
  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newVids = files
      .filter(f => f.type.startsWith('video/'))
      .map(f => ({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        file: f,
        url: URL.createObjectURL(f),
        trimStart: 0,
        trimEnd: 0,
      }));
    if (newVids.length > 0) {
      setVideos(prev => {
        const next = [...prev, ...newVids];
        if (prev.length === 0) setActiveVideo(0);
        return next;
      });
    }
    e.target.value = '';
  };

  const removeVideo = (id) => {
    setVideos(prev => {
      const idx = prev.findIndex(v => v.id === id);
      const v = prev[idx];
      if (v) URL.revokeObjectURL(v.url);
      const next = prev.filter(v => v.id !== id);
      if (activeVideo >= next.length) setActiveVideo(Math.max(0, next.length - 1));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-center gap-2 w-full p-5 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 transition-colors">
        <Upload className="w-5 h-5 text-gray-400" strokeWidth={2} />
        <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">{t.veUploadVideo}</span>
        <input type="file" accept="video/*" multiple className="hidden" onChange={handleUpload} />
      </label>

      {videos.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-slate-500">{t.veNoVideo}</p>
      ) : (
        <div className="space-y-3">
          {videos.map((vid, i) => (
            <div key={vid.id}
              onClick={() => setActiveVideo(i)}
              className={`p-3 rounded-2xl cursor-pointer transition-colors ${i === activeVideo ? 'bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-400' : 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-500" strokeWidth={2} />
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-300 truncate max-w-[160px]">
                    {vid.file.name}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeVideo(vid.id); }}
                  className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
