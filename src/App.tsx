import { useState, useRef, useEffect } from 'react';
import './styles.css';
import { AudioRecorder } from './audio/recorder';
import { AudioPlayback } from './audio/playback';
import { DURATION_SEC } from './audio/degradeGraph';

const DURATION_MS = DURATION_SEC * 1000;

type AppState = 'IDLE' | 'REQUESTING_MIC' | 'RECORDING' | 'FINALIZING' | 'DECODING' | 'PLAYING' | 'DONE' | 'ERROR';

function App() {
    const [state, setState] = useState<AppState>('IDLE');
    const [timer, setTimer] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const recorderRef = useRef<AudioRecorder>(new AudioRecorder());
    const playbackRef = useRef<AudioPlayback | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const blobRef = useRef<Blob | null>(null);

    const recordingTimerRef = useRef<any>(null);
    const countdownIntervalRef = useRef<any>(null);

    useEffect(() => {
        return () => {
            cleanupResources();
        };
    }, []);

    const cleanupResources = () => {
        if (playbackRef.current) playbackRef.current.stop();
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };

    const unlockAudioContext = (ctx: AudioContext) => {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
    };

    const handleStart = async () => {
        try {
            console.log("--- START SESSION ---");
            setState('REQUESTING_MIC');
            setErrorMsg('');

            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            unlockAudioContext(ctx);

            await recorderRef.current.startRecording();

            setState('RECORDING');
            setTimer(DURATION_SEC);

            const startTime = Date.now();

            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, DURATION_SEC - elapsed / 1000);
                setTimer(remaining);
            }, 50);

            if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
            recordingTimerRef.current = setTimeout(() => {
                console.log("--- TIMER ENDED ---");
                finishRecording();
            }, DURATION_MS);

        } catch (e: any) {
            console.error("Start Error:", e);
            setState('ERROR');
            setErrorMsg(e.message || "Failed to start. Please allow microphone access.");
        }
    };

    const playBeep = () => {
        return new Promise<void>((resolve) => {
            if (!audioCtxRef.current) return resolve();
            const ctx = audioCtxRef.current;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);

            const now = ctx.currentTime;
            const dur = 0.5;

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
            gain.gain.setValueAtTime(0.1, now + dur - 0.05);
            gain.gain.linearRampToValueAtTime(0, now + dur);

            osc.start(now);
            osc.stop(now + dur);

            setTimeout(resolve, (dur * 1000) + 100);
        });
    };

    const finishRecording = async () => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);

        setState('FINALIZING');
        console.log("Finalizing recording...");

        try {
            const blob = await recorderRef.current.stopRecording();
            console.log("Blob received:", blob);
            blobRef.current = blob;

            setState('DECODING');

            await playBeep();
            startPlayback();

        } catch (e: any) {
            console.error("Finalize Error:", e);
            setState('ERROR');
            setErrorMsg("Recording failed: " + e.message);
        }
    };

    const startPlayback = async () => {
        if (!blobRef.current || !audioCtxRef.current) {
            setState('ERROR');
            setErrorMsg("Error: Audio data lost.");
            return;
        }

        try {
            setState('PLAYING');

            playbackRef.current = new AudioPlayback(
                audioCtxRef.current,
                (progress) => setTimer(progress),
                () => {
                    console.log("--- SESSION DONE ---");
                    setState('DONE');
                }
            );

            await playbackRef.current.play(blobRef.current);

        } catch (e: any) {
            console.error("Playback Error:", e);
            setState('ERROR');
            setErrorMsg("Playback failed: " + e.message);
        }
    };

    const handleRetry = () => {
        cleanupResources();
        setState('IDLE');
        setTimer(0);
        setErrorMsg('');
        blobRef.current = null;
    };

    const formatTime = (t: number) => t.toFixed(1);

    return (
        <div className="container">
            {state === 'IDLE' && (
                <>
                    <div className="status-label">Public Phone Prototype</div>
                    <h1 className="question">今回考えた公衆電話のアップデート案について教えてください</h1>
                    <button onClick={handleStart}>START</button>
                </>
            )}

            {state === 'REQUESTING_MIC' && (
                <div className="status-label">Requesting Mic Access...</div>
            )}

            {state === 'RECORDING' && (
                <>
                    <div className="status-label">REC</div>
                    <div className="timer">{formatTime(timer)}</div>
                    <p>Recording... ({DURATION_SEC}s locked)</p>
                </>
            )}

            {(state === 'FINALIZING' || state === 'DECODING') && (
                <>
                    <div className="status-label">Processing...</div>
                    <div className="timer">...</div>
                </>
            )}

            {state === 'PLAYING' && (
                <>
                    <div className="status-label playback">PLAYBACK (DEGRADING)</div>
                    <div className="timer">{formatTime(timer)} / {DURATION_SEC}.0</div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(timer / DURATION_SEC) * 100}%` }}></div>
                    </div>
                </>
            )}

            {state === 'DONE' && (
                <>
                    <h1>Session Complete</h1>
                    <button onClick={handleRetry}>TRY AGAIN</button>
                </>
            )}

            {state === 'ERROR' && (
                <>
                    <h1 style={{ color: 'red' }}>Error</h1>
                    <p className="error-msg">{errorMsg}</p>
                    <br />
                    <button onClick={handleRetry}>RESET</button>
                </>
            )}
        </div>
    );
}

export default App;
