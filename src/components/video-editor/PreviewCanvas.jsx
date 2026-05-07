'use client';

import { useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

export default function PreviewCanvas({
  video,
  images,
  audioTracks,
  playing,
  setPlaying,
  currentTime,
  setCurrentTime,
  setDuration,
  trimStart,
  trimEnd,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRefs = useRef([]);
  const rafRef = useRef(null);

  const CANVAS_W = 1920;
  const CANVAS_H = 1080;

  useEffect(() => {
    if (!video) return;
    const v = videoRef.current;
    const onMeta = () => setDuration(v.duration);
    v.addEventListener('loadedmetadata', onMeta);
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [video, setDuration]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (playing) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing, video]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (trimEnd > 0 && v.currentTime >= trimEnd) {
        v.pause();
        setPlaying(false);
        setCurrentTime(trimStart || 0);
        v.currentTime = trimStart || 0;
      }
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [trimStart, trimEnd, setCurrentTime, setPlaying]);

  useEffect(() => {
    if (!video) return;
    const v = videoRef.current;
    if (Math.abs(v.currentTime - currentTime) > 0.1) {
      v.currentTime = currentTime;
    }
  }, [currentTime, video]);

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const imagesList = images.filter(img => img.url);
    const imagesPreloaded = imagesList.map(img => {
      const el = document.createElement('img');
      el.src = img.url;
      return el;
    });

    const draw = () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(v, 0, 0, CANVAS_W, CANVAS_H);

      for (let i = 0; i < imagesPreloaded.length; i++) {
        const img = imagesPreloaded[i];
        const data = imagesList[i];
        if (!img.complete || !img.naturalWidth) continue;

        ctx.globalAlpha = data.opacity;
        const h = data.height || (data.width / img.naturalWidth) * img.naturalHeight;
        ctx.drawImage(img, data.x, data.y, data.width, h);
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, images]);

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
    return () => {
      audioRefs.current.forEach(a => { a.pause(); a.src = ''; });
    };
  }, [audioTracks]);

  useEffect(() => {
    audioRefs.current.forEach((a, i) => {
      if (i < audioTracks.length) {
        if (playing) {
          a.play().catch(() => {});
          a.currentTime = videoRef.current?.currentTime || 0;
        } else {
          a.pause();
        }
      }
    });
  }, [playing, audioTracks]);

  const togglePlay = () => {
    if (!video) return;
    const v = videoRef.current;
    if (playing) {
      setPlaying(false);
    } else {
      if (trimEnd > 0 && v.currentTime >= trimEnd) {
        v.currentTime = trimStart || 0;
      }
      setPlaying(true);
    }
  };

  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = ratio * (trimEnd || (videoRef.current?.duration || 0));
    setCurrentTime(time);
  };

  return (
    <div className="space-y-3">
      <div className="relative w-full bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {video ? (
          <>
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
              className="w-full h-full object-contain" />
            <video ref={videoRef} src={video.url} className="hidden" playsInline />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <div className="text-4xl opacity-30">16:9</div>
              <p className="text-sm font-medium opacity-50">Upload a video to start</p>
            </div>
          </div>
        )}

        {video && !playing && (
          <button onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors">
            <Play className="w-16 h-16 text-white drop-shadow-lg" fill="white" strokeWidth={1.5} />
          </button>
        )}

        {playing && (
          <button onClick={togglePlay}
            className="absolute bottom-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors">
            <Pause className="w-5 h-5 text-white" fill="white" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {video && (
        <div className="h-8 relative cursor-pointer group" onClick={seek}>
          <div className="absolute inset-0 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${(currentTime / (trimEnd || videoRef.current?.duration || 1)) * 100}%` }} />
          </div>
          {trimEnd > 0 && (
            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
              <div className="h-full bg-purple-300/40"
                style={{ marginLeft: `${(trimStart / (videoRef.current?.duration || 1)) * 100}%`, width: `${((trimEnd - trimStart) / (videoRef.current?.duration || 1)) * 100}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
