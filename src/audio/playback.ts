import { DegradeGraph, DURATION_SEC } from './degradeGraph';

export class AudioPlayback {
    private ctx: AudioContext;
    private graph: DegradeGraph;
    private source: AudioBufferSourceNode | null = null;
    private masterGain: GainNode;
    private requestAnimationFrameId: number | null = null;
    private onProgress: (progress: number) => void;
    private onEnded: () => void;
    private startTime: number = 0;

    constructor(ctx: AudioContext, onProgress: (p: number) => void, onEnded: () => void) {
        this.ctx = ctx;
        this.onProgress = onProgress;
        this.onEnded = onEnded;
        this.masterGain = ctx.createGain();
        this.masterGain.connect(ctx.destination);
        this.graph = new DegradeGraph(ctx);
    }

    async play(blob: Blob) {
        console.log("[Playback] decoding...");
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        console.log(`[Playback] decoded. Duration: ${audioBuffer.duration}s`);

        this.source = this.ctx.createBufferSource();
        this.source.buffer = audioBuffer;

        this.graph.connect(this.source, this.masterGain);

        this.source.onended = () => {
            console.log("[Playback] source ended");
            this.stop();
        };

        const now = this.ctx.currentTime;
        this.masterGain.gain.setValueAtTime(0, now);
        this.masterGain.gain.linearRampToValueAtTime(1, now + 0.1);

        this.source.start();
        this.startTime = this.ctx.currentTime;
        console.log("[Playback] started");

        this.update();
    }

    stop() {
        if (this.source) {
            try {
                this.source.stop();
                this.source.disconnect();
            } catch (e) { }
            this.source = null;
        }
        if (this.requestAnimationFrameId) {
            cancelAnimationFrame(this.requestAnimationFrameId);
            this.requestAnimationFrameId = null;
        }

        this.graph.disconnect();
        this.onEnded();
    }

    private update = () => {
        if (!this.source) return;

        const now = this.ctx.currentTime;
        const elapsed = now - this.startTime;

        const progress = Math.min(1, elapsed / DURATION_SEC);

        this.onProgress(elapsed);
        this.graph.update(progress);

        if (elapsed < DURATION_SEC + 1.0 && elapsed < (this.source.buffer?.duration || DURATION_SEC) + 1.0) {
            this.requestAnimationFrameId = requestAnimationFrame(this.update);
        } else {
            console.log("[Playback] Force stop by timer");
            this.stop();
        }
    };
}
