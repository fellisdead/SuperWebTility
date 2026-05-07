'use client';

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Download, Loader2, GripHorizontal } from 'lucide-react';

export default function PreviewCanvas({
  videos, activeVideo, setActiveVideo, images, setImages,
  audioTracks, playing, setPlaying, currentTime, setCurrentTime,
  setDuration, t,
}) {
  const videoRefs = useRef([]);
  const canvasRef = useRef(null);
  const audioRefs = useRef([]);
  const rafRef = useRef(null);
  const imgCache = useRef({});

  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [exporting, setExporting] = useState(false);

  const CANVAS_W = 1920;
  const CANVAS_H = 1080;

  const activeVid = videos[activeVideo] || null;

  useEffect(() => {
    if (!activeVid) return;
    const v = videoRefs.current[activeVideo];
    if (!v) return;
    const onMeta = () => {
      const allDurations = videos.map(c => videoRefs.current.find(r => r?.src === c.url)?.duration || 0);
      setDuration(Math.max(...allDurations, 10));
    };
    v.addEventListener('loadedmetadata', onMeta);
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [activeVid, videos, setDuration]);

  useEffect(() => {
    const v = videoRefs.current[activeVideo];
    if (!v) return;
    if (playing) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing, activeVideo]);

  useEffect(() => {
    if (!activeVid) return;
    const v = videoRefs.current[activeVideo];
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [activeVideo, activeVid, setCurrentTime]);

  useEffect(() => {
    if (!activeVid) return;
    const v = videoRefs.current[activeVideo];
    if (!v) return;
    if (Math.abs((v.currentTime || 0) - currentTime) > 0.15) {
      v.currentTime = currentTime;
    }
    videos.forEach((vid, i) => {
      if (i !== activeVideo) {
        const ov = videoRefs.current[i];
        if (ov) {
          ov.currentTime = currentTime;
        }
      }
    });
  }, [currentTime, activeVideo, videos]);

  useEffect(() => {
    const currentCache = imgCache.current;
    const activeIds = new Set(images.map(i => i.id));
    Object.keys(currentCache).forEach(id => {
      if (!activeIds.has(id)) delete currentCache[id];
    });
    images.forEach(img => {
      if (!currentCache[img.id]) {
        const el = new Image();
        el.src = img.url;
        currentCache[img.id] = { el, url: img.url };
      } else if (currentCache[img.id].url !== img.url) {
        currentCache[img.id].el.src = img.url;
        currentCache[img.id].url = img.url;
      }
    });
  }, [images]);

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const v = videoRefs.current[activeVideo];
      if (!v || v.readyState < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(v, 0, 0, CANVAS_W, CANVAS_H);

      const t = v.currentTime || 0;
      images.forEach(imgData => {
        if (imgData.startTime > 0 && t < imgData.startTime) return;
        if (imgData.endTime > 0 && t > imgData.endTime) return;
        const cached = imgCache.current[imgData.id];
        if (!cached) return;
        const img = cached.el;
        if (!img.complete || !img.naturalWidth) return;
        ctx.globalAlpha = imgData.opacity;
        const h = imgData.height || (imgData.width / img.naturalWidth) * img.naturalHeight;
        ctx.drawImage(img, imgData.x, imgData.y, imgData.width, h);
        ctx.globalAlpha = 1;
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, activeVideo, images]);

  useEffect(() => {
    audioRefs.current = audioRefs.current.slice(0, audioTracks.length);
    audioTracks.forEach((track, i) => {
      if (!audioRefs.current[i]) {
        audioRefs.current[i] = new Audio(track.url);
        audioRefs.current[i].loop = true;
      }
      audioRefs.current[i].volume = track.volume;
    });
    audioRefs.current.forEach((a, i) => { if (i >= audioTracks.length) a.pause(); });
    return () => { audioRefs.current.forEach(a => { a.pause(); a.src = ''; }); };
  }, [audioTracks]);

  useEffect(() => {
    audioRefs.current.forEach((a, i) => {
      if (i < audioTracks.length) {
        if (playing) { a.play().catch(() => {}); } else { a.pause(); }
      }
    });
  }, [playing, audioTracks]);

  const togglePlay = () => {
    if (!activeVid) return;
    setPlaying(!playing);
  };

  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const v = videoRefs.current[activeVideo];
    const dur = v?.duration || 10;
    setCurrentTime(ratio * dur);
  };

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasMouseDown = (e) => {
    const pos = getCanvasPos(e);
    if (!activeVid) return;

    let hitImg = null;
    let hitCorner = null;
    const t = videoRefs.current[activeVideo]?.currentTime || 0;

    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      if (img.startTime > 0 && t < img.startTime) continue;
      if (img.endTime > 0 && t > img.endTime) continue;
      const h = img.height || img.width;
      const CORNER = 16;
      if (pos.x >= img.x + img.width - CORNER && pos.x <= img.x + img.width + CORNER &&
          pos.y >= img.y + h - CORNER && pos.y <= img.y + h + CORNER) {
        hitImg = img; hitCorner = 'se'; break;
      }
      if (pos.x >= img.x && pos.x <= img.x + img.width && pos.y >= img.y && pos.y <= img.y + h) {
        hitImg = img; hitCorner = null; break;
      }
    }

    if (hitCorner) {
      setResizeState({ id: hitImg.id, startX: pos.x, startY: pos.y, startW: hitImg.width, startH: hitImg.height || (hitImg.width / 2) });
    } else if (hitImg) {
      setDragState({ id: hitImg.id, ox: pos.x - hitImg.x, oy: pos.y - hitImg.y });
    }
  };

  useEffect(() => {
    if (!dragState && !resizeState) return;
    const onMove = (e) => {
      const pos = getCanvasPos(e);
      if (dragState) {
        setImages(prev => prev.map(img =>
          img.id === dragState.id ? { ...img, x: Math.round(Math.max(0, pos.x - dragState.ox)), y: Math.round(Math.max(0, pos.y - dragState.oy)) } : img
        ));
      }
      if (resizeState) {
        setImages(prev => prev.map(img => {
          if (img.id !== resizeState.id) return img;
          const nw = Math.max(30, resizeState.startW + (pos.x - resizeState.startX));
          const nh = Math.max(30, resizeState.startH + (pos.y - resizeState.startY));
          return { ...img, width: Math.round(nw), height: Math.round(nh) };
        }));
      }
    };
    const onUp = () => { setDragState(null); setResizeState(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragState, resizeState, setImages]);

  const handleExport = async () => {
    if (!activeVid) return;
    setExporting(true);
    try {
      const canvas = canvasRef.current;
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const blobPromise = new Promise(resolve => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });

      const v = videoRefs.current[activeVideo];
      const dur = v?.duration || videos[activeVideo]?.file?.duration || 10;
      const exportDur = Math.min(dur, 120);

      v.currentTime = 0;
      setCurrentTime(0);
      setPlaying(true);
      recorder.start();

      setTimeout(() => {
        recorder.stop();
        setPlaying(false);
    }, exportDur * 1000);

      const blob = await blobPromise;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edited-video.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
};

  return (
    <div className="space-y-3">
      <div className="relative w-full bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {activeVid ? (
          <>
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
              className="w-full h-full object-contain"
              onMouseDown={handleCanvasMouseDown}
              style={{ cursor: dragState ? 'grabbing' : resizeState ? 'nwse-resize' : 'default' }}
            />
            {videos.map((vid, i) => (
              <video key={i}
                ref={el => { videoRefs.current[i] = el; }}
                src={vid.url}
                className="hidden"
                playsInline
                muted={i !== activeVideo}
              />
            ))}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <div className="text-4xl opacity-30">16:9</div>
              <p className="text-sm font-medium opacity-50">{t.veNoVideo}</p>
            </div>
          </div>
        )}

        {activeVid && !playing && (
          <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors">
            <Play className="w-16 h-16 text-white drop-shadow-lg" fill="white" strokeWidth={1.5} />
          </button>
        )}

        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
          {playing && (
            <button onClick={togglePlay} className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors">
              <Pause className="w-4 h-4 text-white" fill="white" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!activeVid || exporting}
            className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors disabled:opacity-50 ml-auto"
          >
            {exporting ? <Loader2 className="w-4 h-4 text-white animate-spin" strokeWidth={2} /> : <Download className="w-4 h-4 text-white" strokeWidth={2} />}
          </button>
        </div>

        {videos.length > 1 && (
          <div className="absolute top-3 left-3 flex gap-1.5">
            {videos.map((vid, i) => (
              <button key={i}
                onClick={() => setActiveVideo(i)}
                className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${i === activeVideo ? 'bg-purple-500 text-white' : 'bg-black/50 text-gray-300 hover:bg-black/70'}`}
              >
                {vid.file.name.length > 8 ? vid.file.name.slice(0, 8) + '…' : vid.file.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeVid && (
        <div className="h-8 relative cursor-pointer group" onClick={seek}>
          <div className="absolute inset-0 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${(currentTime / (videoRefs.current[activeVideo]?.duration || 10)) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
