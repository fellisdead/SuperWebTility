'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

function TrackBlock({ left, width, label, color, onLeftDrag, onRightDrag, onBodyDrag, minWidth = 2 }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const parent = ref.current?.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      dragging(ratio);
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  return (
    <div ref={ref}
      className="absolute top-1 bottom-1 rounded-md cursor-grab active:cursor-grabbing select-none flex items-center overflow-hidden group"
      style={{ left: `${left}%`, width: `${Math.max(width, minWidth)}%`, background: color.replace('500', '500/20'), border: `1.5px solid ${color}` }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        setDragging((ratio) => onBodyDrag && onBodyDrag(ratio));
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragging((ratio) => onLeftDrag && onLeftDrag(ratio)); }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragging((ratio) => onRightDrag && onRightDrag(ratio)); }}
      />
      <span className="text-[9px] font-bold truncate px-2 pointer-events-none"
        style={{ color: color, maxWidth: '100%' }}>
        {label}
      </span>
    </div>
  );
}

export default function Timeline({
  videos, setVideos, images, setImages, duration, currentTime,
  audioTracks, onSeek,
}) {
  const barRef = useRef(null);
  const TRACK_H = 28;
  const GAP = 4;
  const LABEL_W = 52;
  const totalTracks = 1 + (images.length > 0 ? 1 : 0) + (audioTracks.length > 0 ? 1 : 0);
  const totalH = totalTracks * (TRACK_H + GAP) + GAP;
  const dur = Math.max(duration || 30, 10);

  const xToRatio = useCallback((clientX) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = (e) => {
    if (e.target !== barRef.current && !e.target.classList.contains('track-bg')) return;
    onSeek(xToRatio(e.clientX) * dur);
    const onMove = (ev) => onSeek(xToRatio(ev.clientX) * dur);
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl card-shadow p-4 select-none">
      <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Timeline</div>
      <div className="flex">
        <div className="flex-shrink-0 flex flex-col pt-1" style={{ width: LABEL_W, gap: GAP }}>
          <div className="flex items-center" style={{ height: TRACK_H }}>
            <span className="text-[10px] font-semibold text-purple-500">Video</span>
          </div>
          {images.length > 0 && (
            <div className="flex items-center" style={{ height: TRACK_H }}>
              <span className="text-[10px] font-semibold text-blue-500">Img</span>
            </div>
          )}
          {audioTracks.length > 0 && (
            <div className="flex items-center" style={{ height: TRACK_H }}>
              <span className="text-[10px] font-semibold text-green-500">Audio</span>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col" style={{ height: totalH }} ref={barRef} onMouseDown={handleMouseDown}>
          <div className="flex-1 relative bg-gray-100 dark:bg-slate-900 rounded-xl overflow-hidden track-bg">
            <div style={{ paddingTop: GAP, height: TRACK_H + GAP }} className="relative">
              {videos.map((v) => (
                <TrackBlock
                  key={v.id}
                  left={(v.trimStart / dur) * 100}
                  width={(((v.trimEnd || dur) - v.trimStart) / dur) * 100}
                  label={v.file.name}
                  color="#a855f7"
                  onLeftDrag={(ratio) => {
                    const t = ratio * dur;
                    setVideos(prev => prev.map(p => p.id === v.id ? { ...p, trimStart: Math.min(t, (p.trimEnd || dur) - 0.5) } : p));
                  }}
                  onRightDrag={(ratio) => {
                    const t = ratio * dur;
                    setVideos(prev => prev.map(p => p.id === v.id ? { ...p, trimEnd: Math.max(t, p.trimStart + 0.5) } : p));
                  }}
                  onBodyDrag={(ratio) => {
                    const t = ratio * dur;
                    const len = (v.trimEnd || dur) - v.trimStart;
                    setVideos(prev => prev.map(p => p.id === v.id ? { ...p, trimStart: Math.max(0, t - len / 2), trimEnd: Math.min(dur, t + len / 2) } : p));
                  }}
                />
              ))}
            </div>

            {images.length > 0 && (
              <div style={{ paddingTop: GAP, height: TRACK_H + GAP }} className="relative">
                {images.map((img) => (
                  <TrackBlock
                    key={img.id}
                    left={(img.startTime / dur) * 100}
                    width={(((img.endTime || dur) - img.startTime) / dur) * 100}
                    label={img.file.name}
                    color="#3b82f6"
                    onLeftDrag={(ratio) => {
                      const t = ratio * dur;
                      setImages(prev => prev.map(p => p.id === img.id ? { ...p, startTime: Math.min(t, (p.endTime || dur) - 0.5) } : p));
                    }}
                    onRightDrag={(ratio) => {
                      const t = ratio * dur;
                      setImages(prev => prev.map(p => p.id === img.id ? { ...p, endTime: Math.max(t, p.startTime + 0.5) } : p));
                    }}
                    onBodyDrag={(ratio) => {
                      const t = ratio * dur;
                      const len = (img.endTime || dur) - img.startTime;
                      setImages(prev => prev.map(p => p.id === img.id ? { ...p, startTime: Math.max(0, t - len / 2), endTime: Math.min(dur, t + len / 2) } : p));
                    }}
                  />
                ))}
              </div>
            )}

            {audioTracks.length > 0 && (
              <div style={{ paddingTop: GAP, height: TRACK_H + GAP }} className="relative">
                <div className="absolute top-1 bottom-1 left-0 right-0 rounded-md bg-green-500/20 border border-green-500 flex items-center px-2">
                  <span className="text-[9px] font-bold text-green-600 dark:text-green-400">
                    {audioTracks.length} track{audioTracks.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}

            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none shadow-lg"
              style={{ left: `${(currentTime / dur) * 100}%` }}>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow" />
            </div>

            {Array.from({ length: 11 }).map((_, i) => {
              const t = (i / 10) * dur;
              return (
                <div key={i} className="absolute top-0 bottom-0 border-l border-gray-300/50 dark:border-slate-700/50 pointer-events-none"
                  style={{ left: `${(t / dur) * 100}%` }}>
                  <span className="absolute -top-3.5 left-1 text-[9px] text-gray-400 font-medium whitespace-nowrap">{formatTime(t)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="text-center text-[11px] font-bold text-gray-400 mt-1">{formatTime(currentTime)} / {formatTime(dur)}</div>
    </div>
  );
}
