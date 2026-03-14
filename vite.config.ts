import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'transcript-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/transcript')) {
              const url = new URL(req.url, `http://${req.headers.host}`);
              const videoId = url.searchParams.get('videoId');
              
              if (!videoId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'videoId is required' }));
                return;
              }

              try {
                console.log(`Fetching transcript for videoId: ${videoId}`);
                const transcript = await YoutubeTranscript.fetchTranscript(videoId);
                console.log(`Successfully fetched transcript for ${videoId}, segments: ${transcript.length}`);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(transcript));
              } catch (error) {
                console.error(`Failed to fetch transcript for ${videoId}:`, error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Failed to fetch transcript', details: error instanceof Error ? error.message : String(error) }));
              }
              return;
            }
            next();
          });
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
