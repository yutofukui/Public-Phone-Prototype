export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private resolveStop: ((blob: Blob) => void) | null = null;
    private rejectStop: ((err: Error) => void) | null = null;

    async startRecording(): Promise<void> {
        this.chunks = [];

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = this.getSupportedMimeType();
            console.log(`[Recorder] Using mimeType: ${mimeType}`);

            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                console.log("[Recorder] onstop fired");
                this.finalize();
            };

            this.mediaRecorder.onerror = (e) => {
                console.error("[Recorder] Error:", e);
                if (this.rejectStop) this.rejectStop(new Error("MediaRecorder Error"));
            };

            this.mediaRecorder.start();
            console.log("[Recorder] Started");
        } catch (e) {
            console.error("[Recorder] Start failed", e);
            this.cleanup();
            throw e;
        }
    }

    stopRecording(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                if (this.chunks.length > 0) {
                    console.warn("[Recorder] stop called but inactive. Attempting to finalize existing chunks.");
                    const blob = new Blob(this.chunks, { type: this.ChunksType() });
                    return resolve(blob);
                }
                reject(new Error("Recorder not active"));
                return;
            }

            this.resolveStop = resolve;
            this.rejectStop = reject;

            console.log("[Recorder] Calling stop()");
            this.mediaRecorder.stop();

            setTimeout(() => {
                if (this.resolveStop) {
                    console.warn("[Recorder] Force finalizing after timeout");
                    this.finalize();
                }
            }, 1000);
        });
    }

    private ChunksType() {
        return this.mediaRecorder?.mimeType || 'audio/webm';
    }

    private finalize() {
        if (!this.resolveStop) return;

        const blob = new Blob(this.chunks, { type: this.ChunksType() });
        console.log(`[Recorder] Finalized blob: ${blob.size} bytes, type: ${blob.type}`);

        const resolve = this.resolveStop;
        this.resolveStop = null;
        this.rejectStop = null;

        this.cleanup();
        resolve(blob);
    }

    private cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
        this.mediaRecorder = null;
    }

    private getSupportedMimeType(): string {
        const types = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return "";
    }
}
