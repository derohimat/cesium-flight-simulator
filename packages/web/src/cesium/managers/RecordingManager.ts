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

        this.mediaRecorder.onstop = () => {
            this.saveRecording();
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        console.log('🎥 Recording started');
    }

    public stopRecording(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            console.log('⏹️ Recording stopped');
        }
    }

    private saveRecording(): void {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flight-recording-${new Date().toISOString()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('💾 Recording saved');
    }

    public isActive(): boolean {
        return this.isRecording;
    }
}
