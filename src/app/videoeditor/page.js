'use client';

import { useState } from 'react';
import { Image, Video, Music } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import AccordionCard from '@/components/video-editor/AccordionCard';
import ImageTools from '@/components/video-editor/ImageTools';
import VideoTools from '@/components/video-editor/VideoTools';
import AudioTools from '@/components/video-editor/AudioTools';
import PreviewCanvas from '@/components/video-editor/PreviewCanvas';
import Timeline from '@/components/video-editor/Timeline';

export default function VideoEditor() {
  const { t } = useLanguage();
  const [openCard, setOpenCard] = useState(null);
  const [videos, setVideos] = useState([]);
  const [activeVideo, setActiveVideo] = useState(0);
  const [images, setImages] = useState([]);
  const [audioTracks, setAudioTracks] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);

  const toggleCard = (name) => setOpenCard(prev => prev === name ? null : name);

  return (
    <div className="flex flex-col items-center">
      <main className="w-full max-w-[1200px] px-4 flex flex-col mt-16 mb-24">
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 gradient-text pb-2">{t.veTitle}</h1>
          <p className="text-lg text-gray-600 dark:text-slate-400 font-medium">{t.veDesc}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
          <div className="space-y-4">
            <PreviewCanvas
              videos={videos} activeVideo={activeVideo} setActiveVideo={setActiveVideo}
              images={images} setImages={setImages}
              audioTracks={audioTracks} playing={playing} setPlaying={setPlaying}
              currentTime={currentTime} setCurrentTime={setCurrentTime}
              setDuration={setDuration} t={t}
            />

            <Timeline
              videos={videos} images={images} duration={duration}
              currentTime={currentTime} audioTracks={audioTracks}
              onSeek={(t) => setCurrentTime(t)}
            />
          </div>

          <div className="space-y-4">
            <AccordionCard
              icon={<Video className="w-5 h-5 text-purple-500" strokeWidth={2} />}
              title={t.veVideoTools}
              open={openCard === 'video'}
              onToggle={() => toggleCard('video')}
            >
              <VideoTools
                videos={videos} setVideos={setVideos}
                activeVideo={activeVideo} setActiveVideo={setActiveVideo}
                t={t}
              />
            </AccordionCard>

            <AccordionCard
              icon={<Image className="w-5 h-5 text-blue-500" strokeWidth={2} />}
              title={t.veImageTools}
              open={openCard === 'image'}
              onToggle={() => toggleCard('image')}
            >
              <ImageTools images={images} setImages={setImages} currentTime={currentTime} t={t} />
            </AccordionCard>

            <AccordionCard
              icon={<Music className="w-5 h-5 text-green-500" strokeWidth={2} />}
              title={t.veAudioTools}
              open={openCard === 'audio'}
              onToggle={() => toggleCard('audio')}
            >
              <AudioTools audioTracks={audioTracks} setAudioTracks={setAudioTracks} t={t} />
            </AccordionCard>
          </div>
        </div>
      </main>
    </div>
  );
}
