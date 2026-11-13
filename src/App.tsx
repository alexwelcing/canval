import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import './styles/gallery.css';

import { AESTHETIC_EDITIONS, type AestheticEdition } from './design/catalog';
import {
  CanvasDirector,
  collectCanvasShapeSummaries,
  type DirectorResult,
} from './canvas/canvasDirector';
import { extractEntityPairHints } from './canvas/slotParser';
import { startMobileMicrophone, type MicSession } from './audio/micCapture';
import type {
  EarlybirdTranscriptUpdate,
  EarlybirdWorkerIn,
  EarlybirdWorkerOut,
  GemmaWorkerIn,
  GemmaWorkerOut,
  SemanticResolution,
  StateWorkerIn,
  StateWorkerOut,
  VisionHarmonizePayload,
} from './types/protocol';

declare global {
  interface Window {
    __tldrawEditor?: Editor;
    voiceCanvasSpeak?: (utterance: string) => Promise<DirectorResult | null>;
    voiceCanvasHarmonize?: (goalPrompt?: string) => Promise<DirectorResult | null>;
  }
}

function detectMobileConstrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUa = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (isMobileUa) return true;
  if (typeof mem === 'number' && mem < 6) return true;
  return false;
}

export function App() {
  const [edition, setEdition] = useState<AestheticEdition>(AESTHETIC_EDITIONS[0]);
  const [roomEntered, setRoomEntered] = useState(false);
  const [micActive, setMicActive] = useState(false);

  const [ebProgress, setEbProgress] = useState(0);
  const [gemmaProgress, setGemmaProgress] = useState(0);
  const [stateProgress, setStateProgress] = useState(0);

  const [ebReady, setEbReady] = useState(false);
  const [gemmaReady, setGemmaReady] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const [cloudStudioReady, setCloudStudioReady] = useState(false);

  const [loadingStage, setLoadingStage] = useState('Connecting studio kernel');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [liveUpdate, setLiveUpdate] = useState<EarlybirdTranscriptUpdate | null>(null);
  const [airBuffer, setAirBuffer] = useState<string>('');
  const [lastInscription, setLastInscription] = useState<string>('');
  const [activeAnims, setActiveAnims] = useState<number>(0);
  const [rmsLevel, setRmsLevel] = useState(0);

  const editorRef = useRef<Editor | null>(null);
  const editionRef = useRef<AestheticEdition>(edition);
  editionRef.current = edition;

  const wsRef = useRef<WebSocket | null>(null);
  const cloudReadyRef = useRef(false);
  const localGemmaReadyRef = useRef(false);

  const ebWorkerRef = useRef<Worker | null>(null);
  const gemmaWorkerRef = useRef<Worker | null>(null);
  const stateWorkerRef = useRef<Worker | null>(null);
  const micSessionRef = useRef<MicSession | null>(null);
  const directorRef = useRef(new CanvasDirector());

  const reqCounterRef = useRef(1);
  const manualUttCounterRef = useRef(10000);
  const lastSpecKeyRef = useRef('');
  const fadeTimerRef = useRef<number | null>(null);
  const pendingSpeakResolversRef = useRef<Map<number, (res: DirectorResult | null) => void>>(
    new Map(),
  );

  const localProgress = Math.round(ebProgress * 0.36 + gemmaProgress * 0.44 + stateProgress * 0.2);
  const totalProgress = cloudStudioReady ? 100 : localProgress;
  const modelsReady = (cloudStudioReady && stateReady) || (ebReady && gemmaReady && stateReady);

  const syncShapesToGemma = useCallback(() => {
    const editor = editorRef.current;
    const gw = gemmaWorkerRef.current;
    if (!editor || !gw || !localGemmaReadyRef.current) return;
    const shapes = collectCanvasShapeSummaries(editor);
    const msg: GemmaWorkerIn = { type: 'sync_shapes', shapes };
    gw.postMessage(msg);
  }, []);

  const triggerVisionHarmonize = useCallback(
    async (goalPrompt = 'cohesive museum exhibition composition'): Promise<DirectorResult | null> => {
      const editor = editorRef.current;
      if (!editor) return null;
      const canvasShapes = collectCanvasShapeSummaries(editor);
      setLastInscription('Curating visual harmony…');

      try {
        const res = await fetch('/api/voice/harmonize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvasShapes,
            canvasBg: editionRef.current.frame.canvasPaper,
            goalPrompt,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; harmony?: VisionHarmonizePayload };
          if (data?.harmony) {
            const applied = directorRef.current.applyVisionHarmonize(
              editor,
              data.harmony,
              (nextEd) => setEdition(nextEd),
            );
            setLastInscription(applied.summary);
            syncShapesToGemma();
            return applied;
          }
        }
      } catch {
        // Offline local fallback harmonize
      }

      const fallbackEd =
        AESTHETIC_EDITIONS.find(
          (e) =>
            goalPrompt.toLowerCase().includes(e.title.toLowerCase().split(' ')[0]) ||
            e.id !== editionRef.current.id,
        ) ?? AESTHETIC_EDITIONS[0];

      const fallbackHarmony: VisionHarmonizePayload = {
        editionId: fallbackEd.id,
        critiqueId: canvasShapes.length >= 5 ? 'dense-cluster' : 'balanced-hierarchy',
        critiqueTitle:
          canvasShapes.length >= 5 ? 'Untangled Dense Cluster' : 'Balanced Visual Hierarchy',
        critiqueDescription: 'Aligned composition to archival edition tokens.',
        shouldUntangle: canvasShapes.length >= 4,
        themeScores: {},
        critiqueScores: {},
        modelUsed: 'local-embeddinggemma-2',
        latencyMs: 4,
      };
      const applied = directorRef.current.applyVisionHarmonize(editor, fallbackHarmony, (nextEd) =>
        setEdition(nextEd),
      );
      setLastInscription(applied.summary);
      syncShapesToGemma();
      return applied;
    },
    [syncShapesToGemma],
  );

  const handleResolvedSemantics = useCallback((resolution: SemanticResolution) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (resolution.phase === 'speculative') {
      directorRef.current.executeSpeculative(editor, resolution, editionRef.current);
      return;
    }

    const sw = stateWorkerRef.current;
    if (!sw) return;
    const snapshot = directorRef.current.buildRegisterSnapshot(editor, editionRef.current.id);
    const stepMsg: StateWorkerIn = {
      type: 'step',
      requestId: resolution.requestId,
      snapshot,
      resolution,
    };
    sw.postMessage(stepMsg);
  }, []);

  const resolveViaBestEngine = useCallback(
    async (params: {
      requestId: number;
      utteranceId: number;
      phase: 'speculative' | 'commit';
      text: string;
      ghostText: string;
      words: [string, number][];
      sourceHint?: string | null;
      targetHint?: string | null;
    }) => {
      // 1. Prefer local WebGPU/WASM EmbeddingGemma 2 worker if already hot in RAM
      if (localGemmaReadyRef.current && gemmaWorkerRef.current) {
        const msg: GemmaWorkerIn = {
          type: 'resolve',
          ...params,
        };
        gemmaWorkerRef.current.postMessage(msg);
        return;
      }

      // 2. Otherwise use Cloud Run's hot C++ EmbeddingGemma 2 (`/api/voice/resolve`) for 0-second mobile response!
      const editor = editorRef.current;
      const shapes = editor ? collectCanvasShapeSummaries(editor) : [];
      try {
        const res = await fetch('/api/voice/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...params,
            shapes,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; resolution?: SemanticResolution };
          if (data?.resolution) {
            handleResolvedSemantics(data.resolution);
            return;
          }
        }
      } catch {
        // Fallback to local worker queue if server unreachable
      }

      if (gemmaWorkerRef.current) {
        gemmaWorkerRef.current.postMessage({ type: 'resolve', ...params });
      }
    },
    [handleResolvedSemantics],
  );

  const handleTranscriptUpdate = useCallback(
    (u: EarlybirdTranscriptUpdate) => {
      setLiveUpdate(u);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

      if (u.isFinal) {
        lastSpecKeyRef.current = '';
        const { sourceHint, targetHint } = extractEntityPairHints(u.text);
        void resolveViaBestEngine({
          requestId: reqCounterRef.current++,
          utteranceId: u.utteranceId,
          phase: 'commit',
          text: u.text,
          ghostText: '',
          words: u.words,
          sourceHint,
          targetHint,
        });

        fadeTimerRef.current = window.setTimeout(() => {
          setLiveUpdate(null);
        }, 2600);
      } else {
        const solidWords = u.words.filter(([, p]) => p >= 0.38).map(([w]) => w);
        const ghostWords = u.ghost.filter(([, p]) => p >= 0.36).map(([w]) => w);
        const specText = solidWords.join(' ').trim();
        const specGhost = ghostWords.join(' ').trim();
        const specKey = `${u.utteranceId}:${specText}|${specGhost}`.toLowerCase();

        if (solidWords.length >= 2 && specKey !== lastSpecKeyRef.current) {
          lastSpecKeyRef.current = specKey;
          void resolveViaBestEngine({
            requestId: reqCounterRef.current++,
            utteranceId: u.utteranceId,
            phase: 'speculative',
            text: specText,
            ghostText: specGhost,
            words: u.words,
          });
        }
      }
    },
    [resolveViaBestEngine],
  );

  const speakProgrammatically = useCallback(
    (utterance: string): Promise<DirectorResult | null> => {
      const clean = utterance.trim();
      if (!clean) return Promise.resolve(null);
      setRoomEntered(true);
      const requestId = reqCounterRef.current++;
      const utteranceId = manualUttCounterRef.current++;
      const words: [string, number][] = clean
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => [w, 0.99]);

      setLiveUpdate({
        utteranceId,
        audioTimeSec: 0,
        stepComputeMs: 0,
        text: clean,
        words,
        ghost: [],
        rmsLevel: 0.25,
        isFinal: true,
      });
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => setLiveUpdate(null), 2600);

      const { sourceHint, targetHint } = extractEntityPairHints(clean);
      return new Promise<DirectorResult | null>((resolve) => {
        const timeout = window.setTimeout(() => {
          if (pendingSpeakResolversRef.current.has(requestId)) {
            pendingSpeakResolversRef.current.delete(requestId);
            resolve(null);
          }
        }, 8000);

        pendingSpeakResolversRef.current.set(requestId, (res) => {
          window.clearTimeout(timeout);
          resolve(res);
        });

        void resolveViaBestEngine({
          requestId,
          utteranceId,
          phase: 'commit',
          text: clean,
          ghostText: '',
          words,
          sourceHint,
          targetHint,
        });
      });
    },
    [resolveViaBestEngine],
  );

  // Expose programmatic E2E hooks (`window.voiceCanvasSpeak`, `window.voiceCanvasHarmonize`)
  useEffect(() => {
    window.voiceCanvasSpeak = speakProgrammatically;
    window.voiceCanvasHarmonize = triggerVisionHarmonize;
    return () => {
      delete window.voiceCanvasSpeak;
      delete window.voiceCanvasHarmonize;
    };
  }, [speakProgrammatically, triggerVisionHarmonize]);

  // Zero-button Air-Keyboard: type directly in quiet environments & press Enter to speak
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (ev.key === 'Escape') {
        setAirBuffer('');
        return;
      }
      if (ev.key === 'Backspace') {
        setAirBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (ev.key === 'Enter') {
        setAirBuffer((prev) => {
          const text = prev.trim();
          if (text) {
            void speakProgrammatically(text);
          }
          return '';
        });
        return;
      }
      if (ev.key.length === 1) {
        setRoomEntered(true);
        setAirBuffer((prev) => (prev + ev.key).slice(0, 140));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [speakProgrammatically]);

  // Boot Hybrid 3-Model Studio (Cloud Run `/ws/voice` + Browser ONNX Workers)
  useEffect(() => {
    let cancelled = false;
    const baseUrl = window.location.origin;
    const isMobileConstrained = detectMobileConstrainedDevice();

    // Always boot lightweight State Computer Worker (connects to `/api/state-computer` on mobile, or WebGPU Qwen on desktop)
    const stateWorker = new Worker(new URL('./workers/state.worker.ts', import.meta.url), {
      type: 'module',
    });
    stateWorkerRef.current = stateWorker;

    stateWorker.onmessage = (ev: MessageEvent<StateWorkerOut>) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        setStateProgress(msg.progress);
        setLoadingStage(msg.stage);
      } else if (msg.type === 'ready') {
        setStateProgress(100);
        setStateReady(true);
      } else if (msg.type === 'error') {
        setErrorMsg(msg.message);
      } else if (msg.type === 'decision') {
        const editor = editorRef.current;
        if (!editor) return;
        const result = directorRef.current.executeStateDecision(
          editor,
          msg.payload,
          editionRef.current,
          (nextEd) => setEdition(nextEd),
        );
        if (result?.requestHarmonizeGoal) {
          void triggerVisionHarmonize(result.requestHarmonizeGoal).then((hRes) => {
            const pending = pendingSpeakResolversRef.current.get(msg.payload.requestId);
            if (pending) {
              pendingSpeakResolversRef.current.delete(msg.payload.requestId);
              pending(hRes);
            }
          });
          return;
        }
        if (result?.summary) {
          setLastInscription(result.summary);
        }
        syncShapesToGemma();

        const pending = pendingSpeakResolversRef.current.get(msg.payload.requestId);
        if (pending) {
          pendingSpeakResolversRef.current.delete(msg.payload.requestId);
          pending(result);
        }
      }
    };
    stateWorker.postMessage({
      type: 'init',
      baseUrl,
      isMobileConstrained,
    } satisfies StateWorkerIn);

    const bootLocalSpeechAndGemmaWorkers = () => {
      if (cancelled || ebWorkerRef.current) return;
      const ebWorker = new Worker(new URL('./workers/earlybird.worker.ts', import.meta.url), {
        type: 'module',
      });
      const gemmaWorker = new Worker(new URL('./workers/gemma.worker.ts', import.meta.url), {
        type: 'module',
      });
      ebWorkerRef.current = ebWorker;
      gemmaWorkerRef.current = gemmaWorker;

      ebWorker.onmessage = (ev: MessageEvent<EarlybirdWorkerOut>) => {
        const msg = ev.data;
        if (msg.type === 'progress') {
          setEbProgress(msg.progress);
          if (!cloudReadyRef.current) setLoadingStage(msg.stage);
        } else if (msg.type === 'ready') {
          setEbProgress(100);
          setEbReady(true);
        } else if (msg.type === 'level') {
          setRmsLevel(msg.lvl);
        } else if (msg.type === 'error') {
          if (!cloudReadyRef.current) setErrorMsg(msg.message);
        } else if (msg.type === 'update') {
          handleTranscriptUpdate(msg.payload);
        }
      };

      gemmaWorker.onmessage = (ev: MessageEvent<GemmaWorkerOut>) => {
        const msg = ev.data;
        if (msg.type === 'progress') {
          setGemmaProgress(msg.progress);
          if (!cloudReadyRef.current) setLoadingStage(msg.stage);
        } else if (msg.type === 'ready') {
          localGemmaReadyRef.current = true;
          setGemmaProgress(100);
          setGemmaReady(true);
          syncShapesToGemma();
        } else if (msg.type === 'error') {
          if (!cloudReadyRef.current) setErrorMsg(msg.message);
        } else if (msg.type === 'resolved') {
          handleResolvedSemantics(msg.payload);
        }
      };

      ebWorker.postMessage({ type: 'init', baseUrl } satisfies EarlybirdWorkerIn);
      gemmaWorker.postMessage({ type: 'init', baseUrl } satisfies GemmaWorkerIn);
    };

    // Connect to Cloud Run `/ws/voice` for instant 0-MB-download mobile startup
    const connectStudioSocket = () => {
      if (cancelled) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/ws/voice`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        const connectTimer = window.setTimeout(() => {
          if (!cloudReadyRef.current) {
            bootLocalSpeechAndGemmaWorkers();
          }
        }, 1600);

        ws.onopen = () => {
          // Wait for 'ready' packet confirming Earlybird session is initialized
        };

        ws.onmessage = (ev) => {
          if (typeof ev.data !== 'string') return;
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'ready') {
              window.clearTimeout(connectTimer);
              cloudReadyRef.current = true;
              setCloudStudioReady(true);
              setEbProgress(100);
              setGemmaProgress(100);
              setEbReady(true);
              setGemmaReady(true);
              // On desktop with WebGPU, also warm local Gemma in background for sub-12ms offline resilience
              if (!isMobileConstrained) {
                bootLocalSpeechAndGemmaWorkers();
              }
            } else if (msg.type === 'update' && msg.payload) {
              handleTranscriptUpdate(msg.payload as EarlybirdTranscriptUpdate);
            }
          } catch {
            // ignore malformed frame
          }
        };

        ws.onerror = () => {
          window.clearTimeout(connectTimer);
          if (!cloudReadyRef.current) {
            bootLocalSpeechAndGemmaWorkers();
          }
        };

        ws.onclose = () => {
          window.clearTimeout(connectTimer);
          wsRef.current = null;
          if (!cancelled) {
            if (!ebWorkerRef.current && !isMobileConstrained) {
              bootLocalSpeechAndGemmaWorkers();
            } else if (!cloudReadyRef.current) {
              bootLocalSpeechAndGemmaWorkers();
            }
            window.setTimeout(connectStudioSocket, 3000);
          }
        };
      } catch {
        bootLocalSpeechAndGemmaWorkers();
      }
    };

    connectStudioSocket();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      ebWorkerRef.current?.terminate();
      gemmaWorkerRef.current?.terminate();
      stateWorker.terminate();
      micSessionRef.current?.stop();
    };
  }, [
    handleResolvedSemantics,
    handleTranscriptUpdate,
    syncShapesToGemma,
    triggerVisionHarmonize,
  ]);

  // Keep AudioContext awake across mobile lock/unlock or tab focus
  useEffect(() => {
    const wake = () => {
      void micSessionRef.current?.resumeIfNeeded();
    };
    window.addEventListener('pointerdown', wake, { passive: true });
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  const handleEnterRoom = useCallback(async () => {
    setRoomEntered(true);
    setErrorMsg(null);
    if (micSessionRef.current) {
      await micSessionRef.current.resumeIfNeeded();
      return;
    }
    try {
      const session = await startMobileMicrophone((pcm, lvl) => {
        setRmsLevel(lvl);
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && cloudReadyRef.current) {
          ws.send(pcm.buffer as ArrayBuffer);
          return;
        }
        const w = ebWorkerRef.current;
        if (w) {
          const msg: EarlybirdWorkerIn = { type: 'audio', pcm, lvl };
          w.postMessage(msg, [pcm.buffer]);
        }
      });
      micSessionRef.current = session;
      setMicActive(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone access declined — type to speak');
    }
  }, []);

  const handleCanvasMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      window.__tldrawEditor = editor;
      editor.user.updateUserPreferences({
        colorScheme: editionRef.current.isDarkCanvas ? 'dark' : 'light',
      });

      directorRef.current.animations.attach(editor, (count) => {
        setActiveAnims(count);
      });

      let debounceId: number | null = null;
      const disposeListener = editor.store.listen(
        () => {
          if (debounceId) window.clearTimeout(debounceId);
          debounceId = window.setTimeout(() => {
            directorRef.current.animations.pruneDeletedShapes();
            syncShapesToGemma();
          }, 650);
        },
        { source: 'user', scope: 'document' },
      );

      return () => {
        disposeListener();
        directorRef.current.animations.detach();
      };
    },
    [syncShapesToGemma],
  );

  const frameVars = useMemo(
    () =>
      ({
        '--room-bg': edition.frame.roomBg,
        '--moulding-outer': edition.frame.mouldingOuter,
        '--moulding-face': edition.frame.mouldingFace,
        '--moulding-inner-lip': edition.frame.mouldingInnerLip,
        '--miter-line': edition.frame.miterLine,
        '--mat-paper': edition.frame.matPaper,
        '--inner-bevel-top': edition.frame.innerBevelTop,
        '--inner-bevel-bottom': edition.frame.innerBevelBottom,
        '--canvas-paper': edition.frame.canvasPaper,
        '--placard-ink': edition.frame.placardInk,
        '--placard-muted': edition.frame.placardMuted,
        '--placard-ghost': edition.frame.placardGhost,
        '--placard-rule': edition.frame.placardRule,
        '--accent-tick': edition.frame.accentTick,
      }) as CSSProperties,
    [edition],
  );

  const needleHeightPct = micActive
    ? Math.min(100, Math.max(16, Math.round(rmsLevel * 420)))
    : 12;

  return (
    <div className="gallery-room" style={frameVars}>
      <div className="art-frame-moulding">
        <span className="miter miter-tl" />
        <span className="miter miter-tr" />
        <span className="miter miter-bl" />
        <span className="miter miter-br" />

        <div className="passe-partout-mat">
          <div className="canvas-aperture">
            <div
              className="archive-load-rule"
              style={{
                width: `${totalProgress}%`,
                opacity: modelsReady ? 0 : 1,
              }}
            />

            <Tldraw hideUi onMount={handleCanvasMount} />

            {!roomEntered && (
              <div className="opening-vellum-veil" onPointerDown={handleEnterRoom}>
                <div className="opening-catalogue-tag">
                  CAVALS · EARLYBIRD 29M + GEMMA 2 + QWEN STATE
                </div>
                <h1 className="opening-serif-heading">The Spoken Canvas</h1>
                <p className="opening-serif-sub">
                  No instruments. No menus. Speak forms, motion, and aesthetics into being.
                </p>
                <div className="opening-hairline" />
                <div className="opening-instruction">
                  {modelsReady
                    ? 'Touch anywhere on the canvas to listen'
                    : `Preparing studio models (${totalProgress}%) · Touch to arm`}
                </div>
              </div>
            )}
          </div>

          <div className="mat-plinth">
            <div className="mat-inscription-stream">
              {airBuffer ? (
                <span className="word-speaking">{airBuffer}↵</span>
              ) : errorMsg ? (
                <span className="mat-whisper">{errorMsg}</span>
              ) : !modelsReady ? (
                <span className="mat-whisper">
                  {loadingStage} · {totalProgress}%
                </span>
              ) : liveUpdate && (liveUpdate.words.length > 0 || liveUpdate.ghost.length > 0) ? (
                <>
                  {liveUpdate.words.map(([w, p], idx) => {
                    const isUnfinished =
                      !liveUpdate.isFinal && idx === liveUpdate.words.length - 1;
                    return (
                      <span
                        key={`${idx}-${w}`}
                        className={isUnfinished && p < 0.85 ? 'word-speaking' : 'word-confirmed'}
                      >
                        {idx > 0 ? ' ' : ''}
                        {w}
                      </span>
                    );
                  })}
                  {liveUpdate.ghost.map(([gw], gIdx) => (
                    <span key={`g-${gIdx}-${gw}`} className="word-ghost">
                      {' '}
                      {gw}
                    </span>
                  ))}
                </>
              ) : !roomEntered ? (
                <span className="mat-whisper">Touch the canvas once to open microphone</span>
              ) : lastInscription ? (
                <span className="mat-whisper">{lastInscription}</span>
              ) : (
                <span className="mat-whisper">
                  Listening — speak a form, movement, animation, or harmonize
                </span>
              )}
            </div>

            <div className="mat-edition-plate">
              <div className="acoustic-needle-track">
                <div className="acoustic-needle-fill" style={{ height: `${needleHeightPct}%` }} />
              </div>
              <span>
                {activeAnims > 0 ? `${activeAnims} KINETIC · ` : ''}
                {edition.catalogueNumber} · {edition.title}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
