# Vercel Deployment Guide

This project is set up as a monorepo. Follow these steps to deploy the web application to Vercel.

## 1. Import Project
- Go to your Vercel Dashboard and click **"Add New..." -> "Project"**.
- Import the git repository containing this project.

## 2. Configure Project Settings
Vercel should automatically detect the settings, but you must ensure the **Root Directory** is correct.

- **Framework Preset**: `Vite`
- **Root Directory**: `packages/web`  <-- **IMPORTANT**
  - Click "Edit" next to Root Directory and select the `packages/web` folder.
- **Build Command**: `npm run build` (Default)
- **Output Directory**: `dist` (Default)
- **Install Command**: `npm install` (Default)

## 3. Environment Variables
You must add your Cesium Ion Token for the 3D globe to render correctly.

- Expand **Environment Variables**.
- Add the following variable:
  - **Key**: `VITE_CESIUM_TOKEN`
  - **Value**: *(Paste your Cesium Ion Token here)*

## 4. Deploy
- Click **Deploy**.

## 5. Important Note on Video Recording
The video recording feature uses `ffmpeg.wasm`, which requires specific HTTP headers (`Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy`).
A `vercel.json` file has been added to `packages/web/` to automatically configure these headers. If you experience issues with video recording/conversion, ensure these headers are being served.
