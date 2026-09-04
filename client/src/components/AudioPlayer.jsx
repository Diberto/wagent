import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

export default function AudioPlayer({ audioUrl, duration = 0, isAgent = false }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef(null);

  // Normalizar URL si es necesario
  const normalizedUrl = audioUrl ? (audioUrl.startsWith('http') || audioUrl.startsWith('/') ? audioUrl : `/${audioUrl}`) : '';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setLoadError(false);

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e) => {
      console.warn('Audio element error:', e);
      setLoadError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [normalizedUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !normalizedUrl) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setLoadError(false);
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(err => {
          console.error('Audio play error:', err);
          setLoadError(true);
          setIsPlaying(false);
        });
    }
  };


  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const seekTime = (parseFloat(e.target.value) / 100) * (audioDuration || 1);
    audio.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Generar barras simuladas de onda de audio
  const waveHeights = [40, 60, 25, 80, 45, 90, 30, 75, 50, 100, 35, 65, 85, 40, 70, 30, 55, 95, 45, 60];
  const progressPercent = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-2xl max-w-sm ${isAgent ? 'bg-emerald-950/40 border border-emerald-500/20' : 'bg-slate-800/80 border border-slate-700/50'}`}>
      <audio ref={audioRef} src={normalizedUrl} preload="metadata" />

      {/* Botón de Reproducir / Pausa */}
      <button
        onClick={togglePlay}
        disabled={!normalizedUrl}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-md flex-shrink-0 ${
          isAgent ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-slate-200 hover:bg-white text-slate-900'
        } ${!normalizedUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-0.5" />}
      </button>

      {/* Visualizador de Onda y Progreso */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-[140px]">
        <div className="relative flex items-center gap-[3px] h-7 cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(1, clickX / rect.width));
          if (audioRef.current && audioDuration) {
            audioRef.current.currentTime = pct * audioDuration;
          }
        }}>
          {waveHeights.map((h, i) => {
            const barPct = (i / waveHeights.length) * 100;
            const isPassed = barPct <= progressPercent;
            return (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={`w-[3px] rounded-full transition-colors ${
                  isPassed
                    ? isAgent ? 'bg-emerald-400' : 'bg-sky-400'
                    : 'bg-slate-600'
                } ${isPlaying && isPassed ? 'playing' : ''}`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration || duration)}</span>
        </div>
      </div>

      {/* Botón de Velocidad (1x, 1.5x, 2x) */}
      <button
        onClick={cyclePlaybackRate}
        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 transition-colors flex-shrink-0"
        title="Cambiar velocidad de reproducción"
      >
        {playbackRate}x
      </button>
    </div>
  );
}
