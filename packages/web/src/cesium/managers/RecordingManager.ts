import { Scene } from '../core/Scene';

/** Formats MediaRecorder can write as MP4 directly (Chrome 126+, Safari): no conversion needed. */
const NATIVE_MP4_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'];
const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/**
 * ffmpeg.wasm core, ESM build. @ffmpeg/ffmpeg 0.12 always runs its worker as an ES module,
 * where the UMD build can't load (importScripts throws, and the UMD file has no default
 * export) — that was the "MP4 Conversion failed" error.
 */
const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

function firstSupported(types: string[]): string | undefined {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
    return types.find((t) => MediaRecorder.isTypeSupported(t));
}

export class RecordingManager {
    private scene: Scene;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private isRecording: boolean = false;
    private mimeType = '';

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public startRecording(): void {
        const canvas = this.scene.viewer.canvas;
        if (!canvas) {
            console.error('❌ Cannot start recording: Canvas not found');
            return;
        }

        const stream = canvas.captureStream(60); // 60 FPS
        const mimeType = firstSupported(NATIVE_MP4_TYPES) ?? firstSupported(WEBM_TYPES);
        try {
            this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        } catch (e) {
            console.warn(`${mimeType} not supported, falling back to default`, e);
            this.mediaRecorder = new MediaRecorder(stream);
        }
        this.mimeType = this.mediaRecorder.mimeType || mimeType || 'video/webm';

        this.chunks = [];
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        console.log(`🎥 Recording started (${this.mimeType})`);
    }

    public async stopRecording(fileName?: string): Promise<void> {
        const recorder = this.mediaRecorder;
        if (!recorder || !this.isRecording) return;
        this.isRecording = false;

        // Attach the handler before stopping, so the final chunk can't be missed.
        const stopped = new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
        });
        recorder.stop();
        await stopped;

        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.chunks = [];
        await this.saveRecording(blob, fileName);
    }

    private async saveRecording(blob: Blob, fileName?: string): Promise<void> {
        const baseName = (fileName || `flight-recording-${new Date().toISOString()}`).replace(/\.(mp4|webm)$/i, '');

        if (this.mimeType.startsWith('video/mp4')) {
            this.download(blob, `${baseName}.mp4`);
            console.log('💾 MP4 recording saved (recorded natively, no conversion)');
            return;
        }

        console.log('🔄 Converting WebM → MP4...');
        window.dispatchEvent(new CustomEvent('recording-conversion-start'));
        try {
            this.download(await this.convertToMp4(blob), `${baseName}.mp4`);
            console.log('💾 MP4 recording saved');
        } catch (error) {
            console.error('MP4 conversion failed:', error);
            alert('MP4 conversion failed. Downloading WebM instead.');
            this.download(blob, `${baseName}.webm`);
        } finally {
            window.dispatchEvent(new CustomEvent('recording-conversion-end'));
        }
    }

    /** WebM → H.264 MP4 in the browser (ffmpeg.wasm), playable everywhere incl. QuickTime/iOS. */
    private async convertToMp4(webm: Blob): Promise<Blob> {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

        const ffmpeg = new FFmpeg();
        try {
            await ffmpeg.load({
                coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
            });
            await ffmpeg.writeFile('input.webm', await fetchFile(webm));
            const code = await ffmpeg.exec([
                '-i', 'input.webm',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
                '-pix_fmt', 'yuv420p', // required by QuickTime / iOS / most players
                '-movflags', '+faststart',
                'output.mp4',
            ]);
            if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
            const data = await ffmpeg.readFile('output.mp4');
            return new Blob([data as BlobPart], { type: 'video/mp4' });
        } finally {
            ffmpeg.terminate(); // free the worker and its wasm memory
        }
    }

    private download(blob: Blob, name: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    public isActive(): boolean {
        return this.isRecording;
    }
}
