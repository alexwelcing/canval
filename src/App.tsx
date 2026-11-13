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
import {
  startMobileMicrophone,
  type MicHardwareState,
  type MicSession,
} from './audio/micCapture';
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

type MicUiState = 'idle' | 'requesting' | 'live' | 'suspended' | 'denied';

const VU_BAR_COUNT = 12;
const IDLE_VU_BARS = Array.from({ length: VU_BAR_COUNT }, () => 14);

function detectMobileConstrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUa = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (isMobileUa) return true;
  if (typeof mem === 'number' && mem < 6) return true;
  return false;
}

function computePerceptualBarPct(peakLevel: number): number {
  const clamped = Math.min(1, Math.max(0, peakLevel * 4.6));
  const curved = Math.pow(clamped, 0.58);
  return Math.min(100, Math.max(22, Math.round(22 + curved * 78)));
}

export function App() {
  const [edition, setEdition] = useState<AestheticEdition>(AESTHETIC_EDITIONS[0]);
  const [roomEntered, setRoomEntered] = useState(false);
  const [micState, setMicState] = useState<MicUiState>('idle');
  const [activationStampSeq, setActivationStampSeq] = useState(0);
  const [vuBars, setVuBars] = useState<number[]>(IDLE_VU_BARS);

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
  const zeroRttWsRef = useRef(false);
  const localGemmaReadyRef = useRef(false);

  const ebWorkerRef = useRef<Worker | null>(null);
  const gemmaWorkerRef = useRef<Worker | null>(null);
  const stateWorkerRef = useRef<Worker | null>(null);
  const micSessionRef = useRef<MicSession | null>(null);
  const micStartingRef = useRef(false);
  const micStateRef = useRef<MicUiState>('idle');
  micStateRef.current = micState;

  const directorRef = useRef(new CanvasDirector());

  const reqCounterRef = useRef(1);
  const manualUttCounterRef = useRef(10000);
  const lastSpecKeyRef = useRef('');
  const fadeTimerRef = useRef<number | null>(null);
  const stampTimerRef = useRef<number | null>(null);
  const [showLiveStamp, setShowLiveStamp] = useState(false);
  const pendingSpeakResolversRef = useRef<Map<number, (res: DirectorResult | null) => void>>(
    new Map(),
  );

  const localProgress = Math.round(ebProgress * 0.36 + gemmaProgress * 0.44 + stateProgress * 0.2);
  const totalProgress = cloudStudioReady ? 100 : localProgress;
  const modelsReady = (cloudStudioReady && stateReady) || (ebReady && gemmaReady && stateReady);

  const pushVuLevel = useCallback((lvl: number) => {
    setRmsLevel(lvl);
    const pct = computePerceptualBarPct(lvl);
    setVuBars((prev) => {
      const next = prev.slice(1);
      next.push(pct);
      return next;
    });
  }, []);

  const flashLiveActivationStamp = useCallback(() => {
    setActivationStampSeq((s) => s + 1);
    setShowLiveStamp(true);
    if (stampTimerRef.current) window.clearTimeout(stampTimerRef.current);
    stampTimerRef.current = window.setTimeout(() => {
      setShowLiveStamp(false);
    }, 2850);
  }, []);

  const syncShapesToGemma = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const shapes = collectCanvasShapeSummaries(editor);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && cloudReadyRef.current) {
      ws.send(JSON.stringify({ type: 'sync_state', shapes }));
    }
    const gw = gemmaWorkerRef.current;
    if (gw && localGemmaReadyRef.current) {
      const msg: GemmaWorkerIn = { type: 'sync_shapes', shapes };
      gw.postMessage(msg);
    }
  }, []);

  const enrichTopicBlueprint = useCallback(
    (target: NonNullable<DirectorResult['ideateTarget']>) => {
      if (!target.topic || target.nodeIds.length === 0) return;
      void fetch('/api/voice/ideate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: target.topic,
          blueprintId: target.blueprintKind,
          count: target.nodeIds.length,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ok?: boolean; labels?: string[] } | null) => {
          const editor = editorRef.current;
          if (!editor || !data?.ok || !Array.isArray(data.labels) || data.labels.length < 2) return;
          directorRef.current.applyTopicEnrichment(editor, target.nodeIds, data.labels);
          syncShapesToGemma();
        })
        .catch(() => {});
    },
    [syncShapesToGemma],
  );

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
      if (localGemmaReadyRef.current && gemmaWorkerRef.current) {
        const msg: GemmaWorkerIn = {
          type: 'resolve',
          ...params,
        };
        gemmaWorkerRef.current.postMessage(msg);
        return;
      }

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
    (u: EarlybirdTranscriptUpdate, skipClientResolve = false) => {
      setLiveUpdate(u);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

      if (u.isFinal) {
        lastSpecKeyRef.current = '';
        if (!skipClientResolve) {
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
        }

        fadeTimerRef.current = window.setTimeout(() => {
          setLiveUpdate(null);
        }, 2000);
      } else if (!skipClientResolve) {
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
        if (result?.ideateTarget) {
          enrichTopicBlueprint(result.ideateTarget);
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
          pushVuLevel(msg.lvl);
        } else if (msg.type === 'error') {
          if (!cloudReadyRef.current) setErrorMsg(msg.message);
        } else if (msg.type === 'update') {
          handleTranscriptUpdate(msg.payload, false);
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

        ws.onmessage = (ev) => {
          if (typeof ev.data !== 'string') return;
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'ready') {
              window.clearTimeout(connectTimer);
              cloudReadyRef.current = true;
              zeroRttWsRef.current = Boolean(msg.zeroRttResolve);
              setCloudStudioReady(true);
              setEbProgress(100);
              setGemmaProgress(100);
              setEbReady(true);
              setGemmaReady(true);
              syncShapesToGemma();
              if (!isMobileConstrained) {
                bootLocalSpeechAndGemmaWorkers();
              }
            } else if (msg.type === 'update' && msg.payload) {
              handleTranscriptUpdate(msg.payload as EarlybirdTranscriptUpdate, zeroRttWsRef.current);
            } else if (msg.type === 'resolved' && msg.payload) {
              handleResolvedSemantics(msg.payload as SemanticResolution);
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
          zeroRttWsRef.current = false;
          if (!cancelled) {
            if (!ebWorkerRef.current && !isMobileConstrained) {
              bootLocalSpeechAndGemmaWorkers();
            } else if (!cloudReadyRef.current) {
              bootLocalSpeechAndGemmaWorkers();
            }
            window.setTimeout(connectStudioSocket, 2200);
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
    enrichTopicBlueprint,
    handleResolvedSemantics,
    handleTranscriptUpdate,
    pushVuLevel,
    syncShapesToGemma,
    triggerVisionHarmonize,
  ]);

  const handleHardwareMicState = useCallback(
    (hw: MicHardwareState) => {
      if (hw === 'live') {
        const wasNotLive = micStateRef.current !== 'live';
        setMicState('live');
        setRoomEntered(true);
        setErrorMsg(null);
        if (wasNotLive) {
          flashLiveActivationStamp();
        }
      } else if (hw === 'suspended') {
        setMicState('suspended');
        setRmsLevel(0);
        setVuBars(IDLE_VU_BARS);
      } else if (hw === 'ended') {
        micSessionRef.current = null;
        setMicState('suspended');
        setRmsLevel(0);
        setVuBars(IDLE_VU_BARS);
      }
    },
    [flashLiveActivationStamp],
  );

  const activateMicrophone = useCallback(async () => {
    setErrorMsg(null);

    if (micSessionRef.current?.isAlive()) {
      const resumed = await micSessionRef.current.resumeIfNeeded();
      if (resumed) {
        setRoomEntered(true);
        return;
      }
      micSessionRef.current.stop();
      micSessionRef.current = null;
    }

    if (micStartingRef.current) return;
    micStartingRef.current = true;
    setMicState('requesting');

    try {
      const session = await startMobileMicrophone((pcm, lvl) => {
        pushVuLevel(lvl);
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
      }, handleHardwareMicState);

      micSessionRef.current = session;
      // Fallback veil dismissal if AudioWorklet takes >300ms for first 1280-sample chunk
      window.setTimeout(() => {
        setRoomEntered(true);
      }, 300);
    } catch (err) {
      setMicState('denied');
      setRoomEntered(true);
      setRmsLevel(0);
      setVuBars(IDLE_VU_BARS);
      setErrorMsg(
        err instanceof Error && /https/i.test(err.message)
          ? err.message
          : 'Microphone blocked — allow mic access or touch canvas to retry',
      );
    } finally {
      micStartingRef.current = false;
    }
  }, [handleHardwareMicState, pushVuLevel]);

  // Any trusted tap/click on the canvas automatically arms or resumes a paused/unarmed microphone
  useEffect(() => {
    const onUserGesture = () => {
      if (micSessionRef.current?.isAlive()) {
        void micSessionRef.current.resumeIfNeeded();
        return;
      }
      if (!micStartingRef.current && micStateRef.current !== 'live') {
        void activateMicrophone();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && micSessionRef.current?.isAlive()) {
        void micSessionRef.current.resumeIfNeeded();
      }
    };
    window.addEventListener('click', onUserGesture, { capture: true, passive: true });
    window.addEventListener('touchend', onUserGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('click', onUserGesture, { capture: true });
      window.removeEventListener('touchend', onUserGesture, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activateMicrophone]);

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
          }, 180);
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

  const isHearingVoice =
    micState === 'live' &&
    (rmsLevel >= 0.022 ||
      Boolean(
        liveUpdate &&
          !liveUpdate.isFinal &&
          (liveUpdate.words.length > 0 || liveUpdate.ghost.length > 0),
      ));

  const tallyStateClass =
    micState === 'live'
      ? isHearingVoice
        ? 'state-hearing'
        : 'state-live'
      : `state-${micState}`;

  const tallyLabel =
    micState === 'live'
      ? isHearingVoice
        ? 'HEARING VOICE'
        : 'ON AIR · MIC LIVE'
      : micState === 'requesting'
        ? 'ARMING MIC · ALLOW ACCESS…'
        : micState === 'suspended'
          ? 'MIC PAUSED · TOUCH CANVAS'
          : micState === 'denied'
            ? 'MIC BLOCKED · TOUCH TO RETRY'
            : 'MIC OFF · TOUCH CANVAS TO START';

  return (
    <div className="gallery-room" style={frameVars}>
      <div className="art-frame-moulding">
        <span className="miter miter-tl" />
        <span className="miter miter-tr" />
        <span className="miter miter-bl" />
        <span className="miter miter-br" />

        <div className="passe-partout-mat">
          {/* Upper Passe-Partout Studio Tally + 12-Bar Mechanical Oscillograph */}
          <div className="mat-header-strip" aria-live="polite">
            <div className={`mic-tally-plate ${tallyStateClass}`}>
              <span className="mic-reticle">
                <span className="mic-reticle-core" />
              </span>
              <span>{tallyLabel}</span>
            </div>

            <div
              className={`vu-oscillograph${micState === 'live' ? ' is-live' : ''}${isHearingVoice ? ' is-hearing' : ''}`}
              aria-hidden="true"
            >
              {vuBars.map((barPct, idx) => (
                <div key={idx} className="vu-bar-track">
                  <div
                    className="vu-bar-fill"
                    style={{ height: `${micState === 'live' ? barPct : 14}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={`canvas-aperture${isHearingVoice ? ' is-hearing' : ''}`}>
            <div
              className="archive-load-rule"
              style={{
                width: `${totalProgress}%`,
                opacity: modelsReady ? 0 : 1,
              }}
            />

            {showLiveStamp && (
              <div key={activationStampSeq} className="mic-live-banner">
                <span className="mic-live-banner-dot" />
                <span>MICROPHONE LIVE · SPEAK FREELY</span>
              </div>
            )}

            <Tldraw hideUi onMount={handleCanvasMount} />

            {!roomEntered && (
              <div
                className="opening-vellum-veil"
                onClick={(ev) => {
                  ev.stopPropagation();
                  void activateMicrophone();
                }}
              >
                <div className="opening-catalogue-tag">
                  CAVALS · EARLYBIRD 29M + GEMMA 2 + QWEN STATE
                </div>
                <h1 className="opening-serif-heading">The Spoken Canvas</h1>
                <p className="opening-serif-sub">
                  No instruments. No menus. Speak forms, motion, and aesthetics into being.
                </p>
                <div className="opening-hairline" />
                <div className="opening-instruction">
                  <span className={`mic-tally-plate ${tallyStateClass}`}>
                    <span className="mic-reticle">
                      <span className="mic-reticle-core" />
                    </span>
                  </span>
                  <span>
                    {micState === 'requesting'
                      ? 'Allow microphone access in your browser…'
                      : modelsReady
                        ? 'Touch anywhere on the canvas to activate microphone'
                        : `Preparing studio (${totalProgress}%) · Touch to activate mic`}
                  </span>
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
              ) : micState === 'requesting' ? (
                <span className="mat-whisper">Waiting for microphone permission…</span>
              ) : micState !== 'live' ? (
                <span className="mat-whisper">
                  Microphone inactive — touch anywhere on the canvas to listen
                </span>
              ) : lastInscription ? (
                <span className="mat-whisper">{lastInscription}</span>
              ) : (
                <span className="mat-whisper">
                  Listening — speak a form, movement, animation, or harmonize
                </span>
              )}
            </div>

            <div className="mat-edition-plate">
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
