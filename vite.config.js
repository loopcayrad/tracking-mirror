import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: ['.'],
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
  },
  plugins: [
    isProd ? {
      name: 'inject-mediapipe-cdn',
      transformIndexHtml(html) {
        return html
          .replace(
            /<script[^>]*src=["']\/src\/mediapipe-loader\.js["'][^>]*><\/script>\s*/i,
            ''
          )
          .replace(
            '</head>',
            `  <link rel="preconnect" href="https://cdn.jsdelivr.net" />
  <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
</head>`
          )
          .replace(
            '</body>',
            `  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/face_detection.js" crossorigin="anonymous"></script>
</body>`
          );
      },
      closeBundle() {
        const assetsDir = path.resolve('dist/assets');
        if (!fs.existsSync(assetsDir)) return;
        const files = fs.readdirSync(assetsDir);
        const patterns = [
          'hands_solution',
          'face_detection_solution',
          'hand_landmark',
          'face_detection_full',
          'face_detection_short',
          'hands_solution_packed_assets',
          /^hands-.*\.js$/,
          /^face_detection-.*\.js$/,
          /\.tflite$/,
          /\.wasm$/,
          /\.data$/,
        ];
        let removed = 0;
        files.forEach(file => {
          const isMediapipe = patterns.some(p => {
            if (typeof p === 'string') return file.includes(p);
            return p.test(file);
          });
          if (isMediapipe) {
            fs.unlinkSync(path.join(assetsDir, file));
            removed++;
          }
        });
        if (removed > 0) {
          console.log(`  🗑️  移除了 ${removed} 个 MediaPipe 资源文件（生产环境使用 CDN）`);
        }
      },
    } : null,
  ].filter(Boolean),
});
