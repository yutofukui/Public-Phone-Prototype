export const DURATION_SEC = 20;

export class DegradeGraph {
    private ctx: AudioContext;
    private dryGain: GainNode;
    private wetGain: GainNode;
    private noiseGain: GainNode;
    private dropoutGain: GainNode;
    private filter: BiquadFilterNode;
    private delay: DelayNode;
    private feedback: GainNode;
    private noiseSource: AudioBufferSourceNode | null = null;
    private noiseBuffer: AudioBuffer;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;

        this.dryGain = ctx.createGain();
        this.wetGain = ctx.createGain();
        this.noiseGain = ctx.createGain();
        this.dropoutGain = ctx.createGain();
        this.filter = ctx.createBiquadFilter();
        this.delay = ctx.createDelay(1.0);
        this.feedback = ctx.createGain();

        const bufferSize = ctx.sampleRate * 2;
        this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        this.filter.type = 'bandpass';
        this.filter.frequency.value = 1000;
        this.filter.Q.value = 1.0;

        this.delay.delayTime.value = 0.3;
        this.feedback.gain.value = 0.4;
    }

    connect(source: AudioNode, destination: AudioNode) {
        source.connect(this.dryGain);
        this.dryGain.connect(destination);

        source.connect(this.wetGain);
        this.wetGain.connect(this.dropoutGain);
        this.dropoutGain.connect(this.filter);

        this.filter.connect(this.delay);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.delay.connect(destination);

        this.startNoise(destination);
    }

    startNoise(destination: AudioNode) {
        this.stopNoise();
        this.noiseSource = this.ctx.createBufferSource();
        this.noiseSource.buffer = this.noiseBuffer;
        this.noiseSource.loop = true;
        this.noiseSource.connect(this.noiseGain);
        this.noiseGain.connect(destination);
        this.noiseSource.start();
    }

    stopNoise() {
        if (this.noiseSource) {
            try {
                this.noiseSource.stop();
                this.noiseSource.disconnect();
            } catch (e) { }
            this.noiseSource = null;
        }
    }


    update(progress: number) {
        const p = Math.max(0, Math.min(1, progress));

        const wetVal = Math.pow(p, 1.5);
        const dryVal = 1 - wetVal;
        const noiseVal = 0.0 + 0.25 * Math.pow(p, 2.2);
        const feedbackVal = 0.08 + 0.55 * p;

        const now = this.ctx.currentTime;
        const rampTime = 0.1;

        this.dryGain.gain.setTargetAtTime(dryVal, now, rampTime);
        this.wetGain.gain.setTargetAtTime(wetVal, now, rampTime);
        this.noiseGain.gain.setTargetAtTime(noiseVal, now, rampTime);
        this.feedback.gain.setTargetAtTime(feedbackVal, now, rampTime);

        const dropoutThreshold = 0.98 - (0.05 * p * 10);

        const currentProb = 0.0 + (0.05 * Math.pow(p, 2));

        if (Math.random() < currentProb) {
            const depth = 0.1 + (0.85 * p);
            const volume = 1 - depth;
            this.dropoutGain.gain.setValueAtTime(volume, now);
            const recoveryTime = 0.05 + (0.15 * Math.random());
            this.dropoutGain.gain.setTargetAtTime(1.0, now + recoveryTime, 0.05);
        }
    }

    disconnect() {
        this.dryGain.disconnect();
        this.wetGain.disconnect();
        this.dropoutGain.disconnect();
        this.filter.disconnect();
        this.delay.disconnect();
        this.feedback.disconnect();
        this.noiseGain.disconnect();
        this.stopNoise();
    }
}
