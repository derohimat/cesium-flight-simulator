import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
    plugins: [
        react(),
        cesium(),
    ],
    // ffmpeg.wasm spawns its worker via new URL('./worker.js', import.meta.url); dependency
    // pre-bundling moves the module and breaks that URL in dev.
    optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
})