import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import './styles/gallery.css';

import { AESTHETIC_EDITIONS, type AestheticEdition } from './design/catalog';
import { CanvasDirector, collectCanvasShapeSummaries } from './canvas/canvasDirector';
import { extractEntityPairHints } from './canvas/slotParser';
import { startMobileMicrophone, type MicSession } from './audio/micCapture';
import type {
  EarlybirdTranscriptUpdate,
  EarlybirdWorkerIn,
  EarlybirdWorkerOut,
  GemmaWorkerIn,
  GemmaWorkerOut,
  StateWorkerIn,
  StateWorkerOut,
} from './types/protocol';

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

  const [loadingStage, setLoadingStage] = useState('Initializing studio archive');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [liveUpdate, setLiveUpdate] = useState<EarlybirdTranscriptUpdate | null>(null);
  const [lastInscription, setLastInscription] = useState<string>('');
  const [activeAnims, setActiveAnims] = useState<number>(0);
  const [rmsLevel, setRmsLevel] = useState(0);

  const editorRef = useRef<Editor | null>(null);
  const editionRef = useRef<AestheticEdition>(edition);
  editionRef.current = edition;

  const ebWorkerRef = useRef<Worker | null>(null);
  const gemmaWorkerRef = useRef<Worker | null>(null);
  const stateWorkerRef = useRef<Worker | null>(null);
  const micSessionRef = useRef<MicSession | null>(null);
  const directorRef = useRef(new CanvasDirector());

  const reqCounterRef = useRef(1);
  const lastSpecKeyRef = useRef('');
  const fadeTimerRef = useRef<number | null>(null);

  const totalProgress = Math.round(
    ebProgress * 0.36 + gemmaProgress * 0.44 + stateProgress * 0.2,
  );
  const modelsReady = ebReady && gemmaReady && stateReady;

  const syncShapesToGemma = useCallback(() => {
    const editor = editorRef.current;
    const gw = gemmaWorkerRef.current;
    if (!editor || !gw) return;
    const shapes = collectCanvasShapeSummaries(editor);
    const msg: GemmaWorkerIn = { type: 'sync_shapes', shapes };
    gw.postMessage(msg);
  }, []);

  // Boot the 3-Model Studio Architecture:
  // 1. Earlybird-29M (80ms streaming ONNX speech & ghost words)
  // 2. EmbeddingGemma 2 (768d / 256d MRL aesthetic & layout designer)
  // 3. Qwen State Computer (Canvas register state machine & instruction decoder)
  useEffect(() => {
    const ebWorker = new Worker(new URL('./workers/earlybird.worker.ts', import.meta.url), {
      type: 'module',
    });
    const gemmaWorker = new Worker(new URL('./workers/gemma.worker.ts', import.meta.url), {
      type: 'module',
    });
    const stateWorker = new Worker(new URL('./workers/state.worker.ts', import.meta.url), {
      type: 'module',
    });

    ebWorkerRef.current = ebWorker;
    gemmaWorkerRef.current = gemmaWorker;
    stateWorkerRef.current = stateWorker;

    ebWorker.onmessage = (ev: MessageEvent<EarlybirdWorkerOut>) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        setEbProgress(msg.progress);
        setLoadingStage(msg.stage);
      } else if (msg.type === 'ready') {
        setEbProgress(100);
        setEbReady(true);
      } else if (msg.type === 'level') {
        setRmsLevel(msg.lvl);
      } else if (msg.type === 'error') {
        setErrorMsg(msg.message);
      } else if (msg.type === 'update') {
        const u = msg.payload;
        setLiveUpdate(u);
        if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

        const gw = gemmaWorkerRef.current;
        if (!gw) return;

        if (u.isFinal) {
          lastSpecKeyRef.current = '';
          const { sourceHint, targetHint } = extractEntityPairHints(u.text);
          const resolveMsg: GemmaWorkerIn = {
            type: 'resolve',
            requestId: reqCounterRef.current++,
            utteranceId: u.utteranceId,
            phase: 'commit',
            text: u.text,
            ghostText: '',
            words: u.words,
            sourceHint,
            targetHint,
          };
          gw.postMessage(resolveMsg);

          fadeTimerRef.current = window.setTimeout(() => {
            setLiveUpdate(null);
          }, 2600);
        } else {
          // Speculative Ghost Preview using Earlybird's -90ms words + high-confidence ghost predictions
          const solidWords = u.words.filter(([, p]) => p >= 0.38).map(([w]) => w);
          const ghostWords = u.ghost.filter(([, p]) => p >= 0.36).map(([w]) => w);
          const specText = solidWords.join(' ').trim();
          const specGhost = ghostWords.join(' ').trim();
          const specKey = `${u.utteranceId}:${specText}|${specGhost}`.toLowerCase();

          if (solidWords.length >= 2 && specKey !== lastSpecKeyRef.current) {
            lastSpecKeyRef.current = specKey;
            const resolveMsg: GemmaWorkerIn = {
              type: 'resolve',
              requestId: reqCounterRef.current++,
              utteranceId: u.utteranceId,
              phase: 'speculative',
              text: specText,
              ghostText: specGhost,
              words: u.words,
            };
            gw.postMessage(resolveMsg);
          }
        }
      }
    };

    gemmaWorker.onmessage = (ev: MessageEvent<GemmaWorkerOut>) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        setGemmaProgress(msg.progress);
        setLoadingStage(msg.stage);
      } else if (msg.type === 'ready') {
        setGemmaProgress(100);
        setGemmaReady(true);
        syncShapesToGemma();
      } else if (msg.type === 'error') {
        setErrorMsg(msg.message);
      } else if (msg.type === 'resolved') {
        const editor = editorRef.current;
        if (!editor) return;

        if (msg.payload.phase === 'speculative') {
          directorRef.current.executeSpeculative(editor, msg.payload, editionRef.current);
          return;
        }

        // Commit phase -> Dispatch register snapshot + semantic vectors to Model 3 (Qwen State Computer)
        const sw = stateWorkerRef.current;
        if (!sw) return;
        const snapshot = directorRef.current.buildRegisterSnapshot(editor, editionRef.current.id);
        const stepMsg: StateWorkerIn = {
          type: 'step',
          requestId: msg.payload.requestId,
          snapshot,
          resolution: msg.payload,
        };
        sw.postMessage(stepMsg);
      }
    };

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
        if (result?.summary) {
          setLastInscription(result.summary);
        }
        syncShapesToGemma();
      }
    };

    const baseUrl = window.location.origin;
    const isMobileConstrained = detectMobileConstrainedDevice();

    const initEb: EarlybirdWorkerIn = { type: 'init', baseUrl };
    const initGm: GemmaWorkerIn = { type: 'init', baseUrl };
    const initSt: StateWorkerIn = { type: 'init', baseUrl, isMobileConstrained };

    ebWorker.postMessage(initEb);
    gemmaWorker.postMessage(initGm);
    stateWorker.postMessage(initSt);

    return () => {
      ebWorker.terminate();
      gemmaWorker.terminate();
      stateWorker.terminate();
      micSessionRef.current?.stop();
    };
  }, [syncShapesToGemma]);

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
        const w = ebWorkerRef.current;
        if (!w) return;
        const msg: EarlybirdWorkerIn = { type: 'audio', pcm, lvl };
        w.postMessage(msg, [pcm.buffer]);
      });
      micSessionRef.current = session;
      setMicActive(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone access declined');
    }
  }, []);

  const handleCanvasMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
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
                  CANVAL · EARLYBIRD 29M + GEMMA 2 + QWEN STATE
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
              {errorMsg ? (
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
                  Listening — speak a form, movement, animation, or aesthetic
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
