'use client';

import { Upload, Music, Trash2, Volume2 } from 'lucide-react';

export default function AudioTools({ audioTracks, setAudioTracks, t }) {
  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newTracks = files
      .filter(f => f.type.startsWith('audio/'))
      .map(f => ({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        file: f,
        url: URL.createObjectURL(f),
        volume: 0.7,
        muted: false,
      }));
    setAudioTracks(prev => [...prev, ...newTracks]);
    e.target.value = '';
  };

  const removeTrack = (id) => {
    setAudioTracks(prev => {
      const track = prev.find(t => t.id === id);
      if (track) URL.revokeObjectURL(track.url);
      return prev.filter(t => t.id !== id);
    });
  };

  const updateTrack = (id, prop, value) => {
    setAudioTracks(prev => prev.map(t => t.id === id ? { ...t, [prop]: value } : t));
  };

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-center gap-2 w-full p-5 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl cursor-pointer hover:border-green-400 dark:hover:border-green-500 transition-colors">
        <Upload className="w-5 h-5 text-gray-400" strokeWidth={2} />
        <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">{t.veUploadAudio}</span>
        <input type="file" accept="audio/*" multiple className="hidden" onChange={handleUpload} />
      </label>

      {audioTracks.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-slate-500">{t.veNoAudio}</p>
      ) : (
        <div className="space-y-3">
          {audioTracks.map(track => (
            <div key={track.id} className="p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-green-500" strokeWidth={2} />
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-300 truncate max-w-[180px]">
                    {track.file.name}
                  </span>
                </div>
                <button onClick={() => removeTrack(track.id)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">{t.veVolume}</span>
                <input type="range" min={0} max={100} value={Math.round(track.volume * 100)}
                  onChange={e => updateTrack(track.id, 'volume', +e.target.value / 100)}
                  className="w-full accent-green-500" />
                <span className="text-xs font-semibold text-gray-400 w-9 text-right">{Math.round(track.volume * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
