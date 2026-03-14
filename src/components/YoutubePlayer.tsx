import React, { useEffect, useRef, useState } from 'react';

interface YoutubePlayerProps {
  videoId: string;
  onTimeUpdate?: (time: number) => void;
  onPlayerReady?: (player: any) => void;
  onStateChange?: (state: number) => void;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export const YoutubePlayer: React.FC<YoutubePlayerProps> = ({
  videoId,
  onTimeUpdate,
  onPlayerReady,
  onStateChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const loadVideo = () => {
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        return;
      }

      playerRef.current = new window.YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            onPlayerReady?.(event.target);
          },
          onStateChange: (event: any) => {
            onStateChange?.(event.data);
            if (event.data === window.YT.PlayerState.PLAYING) {
              startTracking();
            } else {
              stopTracking();
            }
          },
        },
      });
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = loadVideo;
    } else if (window.YT && window.YT.Player) {
      loadVideo();
    }

    return () => {
      stopTracking();
    };
  }, [videoId]);

  const startTracking = () => {
    if (intervalRef.current) return;
    intervalRef.current = window.setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        onTimeUpdate?.(playerRef.current.getCurrentTime());
      }
    }, 500);
  };

  const stopTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
      <div id="youtube-player" className="absolute inset-0" />
    </div>
  );
};
