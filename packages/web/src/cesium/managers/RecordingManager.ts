import { Scene } from '../core/Scene';

export class RecordingManager {
    private scene: Scene;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private isRecording: boolean = false;

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
        const options = { mimeType: 'video/webm; codecs=vp9' };
        
        try {
            this.mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            console.warn('VP9 not supported, falling back to default', e);
            this.mediaRecorder = new MediaRecorder(stream);
        }

        this.chunks = [];
        
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        // The onstop handler is now managed within stopRecording, so this can be removed or left as a no-op if stopRecording always handles it.
        // For now, removing it as stopRecording explicitly sets its own onstop handler.

        this.mediaRecorder.start();
        this.isRecording = true;
        console.log('🎥 Recording started');
    }

    public async stopRecording(fileName?: string): Promise<void> {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;

            await new Promise<void>((resolve) => {
                if (this.mediaRecorder) {
                    this.mediaRecorder.onstop = async () => {
                        const blob = new Blob(this.chunks, { type: 'video/webm' });
                        this.chunks = []; // Clear chunks after creating blob
                        await this.saveRecording(blob, fileName);
                        resolve();
                    };
                } else {
                    resolve();
                }
            });
        }
    }

    private async saveRecording(blob: Blob, fileName?: string): Promise<void> {
        console.log('🔄 Starting MP4 conversion...');

        // Notify UI that conversion started
        window.dispatchEvent(new CustomEvent('recording-conversion-start'));

        try {
            const { FFmpeg } = await import('@ffmpeg/ffmpeg');
            const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

            const ffmpeg = new FFmpeg();

            // Load FFmpeg
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });

            // Write raw webm to FFmpeg FS
            await ffmpeg.writeFile('input.webm', await fetchFile(blob));

            // Run conversion
            await ffmpeg.exec(['-i', 'input.webm', 'output.mp4']);

            // Read output
            const data = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([data as any], { type: 'video/mp4' });

            // Download MP4
            const url = URL.createObjectURL(mp4Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || `flight-recording-${new Date().toISOString()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('💾 MP4 Recording saved');
        } catch (error) {
            console.error('MP4 Conversion failed:', error);
            alert('MP4 Conversion failed. Downloading WebM instead.');

            // Fallback to WebM using the existing blob
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName ? fileName.replace('.mp4', '.webm') : `flight-recording-${new Date().toISOString()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } finally {
            // Notify UI that conversion ended
            window.dispatchEvent(new CustomEvent('recording-conversion-end'));
        }
    }

    public isActive(): boolean {
        return this.isRecording;
    }
}
