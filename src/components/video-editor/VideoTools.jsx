'use client';

import { Upload, Scissors, Video } from 'lucide-react';

export default function VideoTools({ video, setVideo, trimStart, setTrimStart, trimEnd, setTrimEnd, currentTime, duration }) {
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('video/')) return;
    if (video) URL.revokeObjectURL(video.url);
    setVideo({
      file,
      url: URL.createObjectURL(file),
    });
    setTrimStart(0);
    setTrimEnd(0);
    e.target.value = '';
  };

  const clearVideo = () => {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    setTrimStart(0);
    setTrimEnd(0);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      {!video ? (
        <label className="flex items-center justify-center gap-2 w-full p-5 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 transition-colors">
          <Upload className="w-5 h-5 text-gray-400" strokeWidth={2} />
          <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">Upload Video</span>
          <input type="file" accept="video/*" className="hidden" onChange={handleUpload} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-purple-500" strokeWidth={2} />
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-300 truncate max-w-[200px]">
                {video.file.name}
              </span>
            </div>
            <button onClick={clearVideo} className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors">
              Remove
            </button>
          </div>

          {duration > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-purple-500" strokeWidth={2} />
                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">
                  Trim: {formatTime(trimStart)} &mdash; {formatTime(trimEnd || duration)}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Start ({formatTime(trimStart)})</span>
                  <button onClick={() => setTrimStart(currentTime)} className="text-[11px] font-bold text-purple-500 hover:text-purple-400">
                    Set at {formatTime(currentTime)}
                  </button>
                </div>
                <input type="range" min={0} max={duration} step={0.1} value={trimStart}
                  onChange={e => setTrimStart(Math.min(+e.target.value, trimEnd || duration))}
                  className="w-full accent-purple-500" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">End ({formatTime(trimEnd || duration)})</span>
                  <button onClick={() => setTrimEnd(currentTime)} className="text-[11px] font-bold text-purple-500 hover:text-purple-400">
                    Set at {formatTime(currentTime)}
                  </button>
                </div>
                <input type="range" min={trimStart || 0} max={duration} step={0.1} value={trimEnd || duration}
                  onChange={e => setTrimEnd(+e.target.value)}
                  className="w-full accent-purple-500" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
