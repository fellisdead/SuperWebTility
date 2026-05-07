'use client';

import { useRef, useEffect, useCallback } from 'react';

export default function Timeline({
  videos, images, duration, currentTime, audioTracks,
  onSeek, onMoveImage, onResizeImage,
}) {
  const barRef = useRef(null);
  const TRACK_HEIGHT = 28;
  const GAP = 4;
  const LABEL_W = 52;
  const totalTracks = videos.length + (images.length > 0 ? 1 : 0) + (audioTracks.length > 0 ? 1 : 0);
  const totalH = totalTracks * (TRACK_HEIGHT + GAP) + GAP;

  const dur = Math.max(duration || 30, 10);

  const timeToX = useCallback((t) => `${(t / dur) * 100}%`, [dur]);
  const xToTime = useCallback((clientX) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - LABEL_W) / (rect.width - LABEL_W)));
    return ratio * dur;
  }, [dur]);

  const handleMouseDown = (e) => {
    const t = xToTime(e.clientX);
    onSeek(t);
    const onMove = (ev) => onSeek(xToTime(ev.clientX));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const thumbnails = [];
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * dur;
    thumbnails.push({ t, label: formatTime(t) });
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl card-shadow p-4">
      <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">Timeline</div>
      <div className="flex">
        <div className="flex-shrink-0 flex flex-col gap-[4px] pt-1" style={{ width: LABEL_W }}>
          {videos.length > 0 && <span className="text-[10px] font-semibold text-purple-500 leading-[28px]">Video</span>}
          {images.length > 0 && <span className="text-[10px] font-semibold text-blue-500 leading-[28px]">Img</span>}
          {audioTracks.length > 0 && <span className="text-[10px] font-semibold text-green-500 leading-[28px]">Audio</span>}
        </div>
        <div className="flex-1 flex flex-col gap-[4px]">
          <div
            ref={barRef}
            className="relative w-full cursor-pointer select-none bg-gray-100 dark:bg-slate-900 rounded-xl overflow-hidden"
            style={{ height: totalH }}
            onMouseDown={handleMouseDown}
          >
            {thumbnails.map(({ t, label }) => (
              <div key={t} className="absolute top-0 bottom-0 border-l border-gray-300 dark:border-slate-700" style={{ left: `calc(${LABEL_W}px + ${timeToX(t)})` }}>
                <span className="absolute -top-4 -translate-x-1/2 text-[9px] text-gray-400 font-medium whitespace-nowrap">{label}</span>
              </div>
            ))}

            <div className="absolute left-0 right-0 top-0 bottom-0" style={{ paddingLeft: LABEL_W + 'px' }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {videos.map((v, vi) => {
                  const y = GAP + vi * (TRACK_HEIGHT + GAP);
                  const sx = (v.trimStart / dur) * 100;
                  const sw = ((v.trimEnd || dur) - v.trimStart) / dur * 100;
                  return (
                    <g key={v.id}>
                      <rect x={`${sx}%`} y={y} width={`${Math.max(sw, 1)}%`} height={TRACK_HEIGHT} rx={6}
                        className="fill-purple-500/20 stroke-purple-500" strokeWidth={1.5} />
                      <text x={`${sx + sw / 2}%`} y={y + TRACK_HEIGHT / 2 + 4} textAnchor="middle"
                        className="fill-purple-600 dark:fill-purple-400" fontSize={9} fontWeight={700}>
                        {v.file.name.length > 12 ? v.file.name.slice(0, 12) + '…' : v.file.name}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {images.map((img) => {
                  const y = GAP + videos.length * (TRACK_HEIGHT + GAP);
                  const sx = (img.startTime / dur) * 100;
                  const sw = ((img.endTime || dur) - img.startTime) / dur * 100;
                  return (
                    <g key={img.id}>
                      <rect x={`${sx}%`} y={y} width={`${Math.max(sw, 1)}%`} height={TRACK_HEIGHT} rx={6}
                        className="fill-blue-500/20 stroke-blue-500" strokeWidth={1.5} />
                    </g>
                  );
                })}
              </svg>

              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {audioTracks.length > 0 && (
                  <rect x="0%" y={GAP + (videos.length + (images.length > 0 ? 1 : 0)) * (TRACK_HEIGHT + GAP)}
                    width="100%" height={TRACK_HEIGHT} rx={6}
                    className="fill-green-500/20 stroke-green-500" strokeWidth={1.5} />
                )}
              </svg>

              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none shadow-lg"
                style={{ left: `${(currentTime / dur) * 100}%` }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="text-center text-[11px] font-bold text-gray-400 mt-1">{formatTime(currentTime)} / {formatTime(dur)}</div>
    </div>
  );
}
