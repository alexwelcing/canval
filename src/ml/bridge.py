"""Stdio JSON-RPC bridge for Earlybird-29M (streaming STT) and EmbeddingGemma 2 (visual design & intent routing)."""
import base64
import io
import json
import os
import sys
import threading
import time
import traceback
import numpy as np
import torch
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from earlybird import Earlybird


def emit(payload: dict):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


class MLBridgeServer:
    def __init__(self, catalog: dict):
        self.catalog = catalog
        self.sessions = {}
        self.shape_emb_cache = {}
        self.gemma = None
        self.gemma_ready = False
        self.gemma_load_ms = 0.0
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = (
            torch.bfloat16
            if (torch.cuda.is_available() and torch.cuda.is_bf16_supported())
            else torch.float32
        )

        self.intent_ids, self.intent_mat = [], np.zeros((0, 768), dtype=np.float32)
        self.theme_ids, self.theme_mat = [], np.zeros((0, 768), dtype=np.float32)
        self.layout_ids, self.layout_mat = [], np.zeros((0, 768), dtype=np.float32)
        self.arch_ids, self.arch_mat = [], np.zeros((0, 768), dtype=np.float32)
        self.critique_ids, self.critique_mat = [], np.zeros((0, 768), dtype=np.float32)

        self.critique_specs = [
            {
                "id": "balanced-hierarchy",
                "title": "Balanced Visual Hierarchy",
                "description": "Well-proportioned diagram with clear primary, secondary, and accent color hierarchy and generous whitespace.",
            },
            {
                "id": "needs-accent-contrast",
                "title": "Needs Accent Contrast",
                "description": "Uniform monochrome nodes that would benefit from semantic color differentiation and semi-translucent fills.",
            },
            {
                "id": "dense-cluster",
                "title": "Dense Node Cluster",
                "description": "Tightly packed or overlapping boxes that need clean grid or horizontal row alignment and breathing room.",
            },
            {
                "id": "sparse-minimal",
                "title": "Sparse Minimalist Canvas",
                "description": "Minimalist open canvas with a few focal elements suited for bold typography and framed structure.",
            },
        ]

        t0 = time.perf_counter()
        self.eb = Earlybird.from_pretrained(
            os.environ.get("EARLYBIRD_MODEL", "sahilmahendrakar/Earlybird-29M"),
            threads=int(os.environ.get("EB_THREADS", "2")),
        )
        self.eb_load_ms = round((time.perf_counter() - t0) * 1000, 1)

        # Load EmbeddingGemma 2 synchronously if on GPU or requested, or in background thread on CPU
        load_gemma_env = os.environ.get("LOAD_EMBEDDING_GEMMA", "auto")
        if load_gemma_env == "sync" or (load_gemma_env == "auto" and self.device == "cuda"):
            self._load_gemma()
        elif load_gemma_env != "0":
            threading.Thread(target=self._load_gemma, daemon=True).start()

    def _load_gemma(self):
        try:
            t1 = time.perf_counter()
            from sentence_transformers import SentenceTransformer

            text_only = os.environ.get("GEMMA_TEXT_ONLY", "0") == "1"
            cfg_kwargs = {"vision_config": None, "audio_config": None} if text_only else {"audio_config": None}
            gemma = SentenceTransformer(
                os.environ.get("EMBEDDING_GEMMA_MODEL", "google/embeddinggemma-2"),
                device=self.device,
                model_kwargs={"torch_dtype": self.dtype},
                config_kwargs=cfg_kwargs,
            )
            self.intent_ids, self.intent_mat = self._encode_corpus(
                gemma,
                self.catalog.get("intents", []),
                lambda x: f"title: {x['title']} | text: {x['description']} Examples: {'; '.join(x.get('exemplars', []))}",
            )
            self.theme_ids, self.theme_mat = self._encode_corpus(
                gemma,
                self.catalog.get("themes", []),
                lambda x: f"title: {x['title']} | text: {x['description']}",
            )
            self.layout_ids, self.layout_mat = self._encode_corpus(
                gemma,
                self.catalog.get("layouts", []),
                lambda x: f"title: {x['title']} | text: {x['description']}",
            )
            self.arch_ids, self.arch_mat = self._encode_corpus(
                gemma,
                self.catalog.get("archetypes", []),
                lambda x: f"title: {x['title']} | text: {x['description']}",
            )
            self.critique_ids, self.critique_mat = self._encode_corpus(
                gemma,
                self.critique_specs,
                lambda x: f"title: {x['title']} | text: {x['description']}",
            )
            self.gemma = gemma
            self.gemma_load_ms = round((time.perf_counter() - t1) * 1000, 1)
            self.gemma_ready = True
        except Exception:
            self.gemma_ready = False

    def _encode_corpus(self, gemma_model, items: list, fmt_fn):
        if not items:
            return [], np.zeros((0, 768), dtype=np.float32)
        ids = [it["id"] for it in items]
        docs = [fmt_fn(it) for it in items]
        vecs = gemma_model.encode(docs, normalize_embeddings=True)
        return ids, np.asarray(vecs, dtype=np.float32)

    def _encode_query(self, text: str) -> np.ndarray:
        vec = self.gemma.encode(
            text,
            prompt_name="SearchQuery",
            normalize_embeddings=True,
        )
        return np.asarray(vec, dtype=np.float32)

    def _get_shape_embeddings(self, shapes: list) -> tuple[list[str], np.ndarray]:
        if not shapes or not self.gemma_ready:
            return [], np.zeros((0, 768), dtype=np.float32)
        ids = []
        missing_texts = []
        missing_keys = []
        keys = []
        for s in shapes:
            sid = s["id"]
            ids.append(sid)
            doc = f"title: {s.get('label', 'Node')} | text: {s.get('label', '')} ({s.get('geo') or s.get('type', 'shape')}, color {s.get('color', 'blue')})"
            keys.append(doc)
            if doc not in self.shape_emb_cache:
                missing_keys.append(doc)
                missing_texts.append(doc)
        if missing_texts:
            new_vecs = np.asarray(
                self.gemma.encode(missing_texts, normalize_embeddings=True),
                dtype=np.float32,
            )
            for k, v in zip(missing_keys, new_vecs):
                self.shape_emb_cache[k] = v
        mat = np.stack([self.shape_emb_cache[k] for k in keys], axis=0)
        return ids, mat

    def _scores_dict(self, ids: list[str], mat: np.ndarray, q_vec: np.ndarray) -> dict[str, float]:
        if len(ids) == 0 or mat.shape[0] == 0:
            return {}
        sims = mat @ q_vec
        return {k: round(float(v), 4) for k, v in zip(ids, sims)}

    def handle_audio_chunk(self, params: dict) -> dict:
        session_id = params.get("sessionId", "default")
        if session_id not in self.sessions:
            self.sessions[session_id] = self.eb.stream(guess=2)
        stream = self.sessions[session_id]

        b64 = params.get("pcmBase64", "")
        raw = base64.b64decode(b64) if b64 else b""
        samples = np.frombuffer(raw, dtype=np.float32)

        t0 = time.perf_counter()
        updates = stream.feed(samples)
        step_ms = round((time.perf_counter() - t0) * 1000, 1)
        u = updates[-1] if updates else stream.update()

        return {
            "sessionId": session_id,
            "time": u.time,
            "text": u.text,
            "words": [[w, round(float(p), 3)] for w, p in u.words],
            "guess": [[w, round(float(p), 3)] for w, p in u.guess],
            "stepMs": step_ms,
            "updated": len(updates) > 0,
        }

    def handle_audio_reset(self, params: dict) -> dict:
        session_id = params.get("sessionId", "default")
        self.sessions[session_id] = self.eb.stream(guess=2)
        return {"sessionId": session_id, "time": 0, "text": "", "words": [], "guess": []}

    def handle_score_utterance(self, params: dict) -> dict:
        if not self.gemma_ready or self.gemma is None:
            raise RuntimeError("EmbeddingGemma 2 warming up")
        t0 = time.perf_counter()
        utterance = params.get("utterance", "").strip()
        shapes = params.get("canvasShapes", [])
        from_query = params.get("fromQuery")
        to_query = params.get("toQuery")

        if not utterance:
            return {"intentScores": {}, "latencyMs": 0.0}

        q_vec = self._encode_query(utterance)
        shape_ids, shape_mat = self._get_shape_embeddings(shapes)

        res = {
            "intentScores": self._scores_dict(self.intent_ids, self.intent_mat, q_vec),
            "themeScores": self._scores_dict(self.theme_ids, self.theme_mat, q_vec),
            "layoutScores": self._scores_dict(self.layout_ids, self.layout_mat, q_vec),
            "archetypeScores": self._scores_dict(self.arch_ids, self.arch_mat, q_vec),
            "targetScores": self._scores_dict(shape_ids, shape_mat, q_vec),
            "modelUsed": f"google/embeddinggemma-2 ({self.device}, {str(self.dtype).replace('torch.', '')})",
        }

        if from_query and len(shape_ids) > 0:
            fq_vec = self._encode_query(from_query)
            res["sourceTargetScores"] = self._scores_dict(shape_ids, shape_mat, fq_vec)
        if to_query and len(shape_ids) > 0:
            tq_vec = self._encode_query(to_query)
            res["destTargetScores"] = self._scores_dict(shape_ids, shape_mat, tq_vec)

        res["latencyMs"] = round((time.perf_counter() - t0) * 1000, 1)
        return res

    def _render_synthetic_canvas_snapshot(self, shapes: list, bg_hex: str = "#08101d") -> Image.Image:
        img = Image.new("RGB", (448, 280), color=bg_hex)
        draw = ImageDraw.Draw(img)
        color_map = {
            "black": "#1e293b",
            "grey": "#64748b",
            "light-violet": "#c084fc",
            "violet": "#8b5cf6",
            "blue": "#3b82f6",
            "light-blue": "#38bdf8",
            "yellow": "#facc15",
            "orange": "#f97316",
            "green": "#22c55e",
            "light-green": "#4ade80",
            "light-red": "#fb7185",
            "red": "#ef4444",
            "white": "#f8fafc",
        }
        if not shapes:
            return img
        xs = [float(s.get("x", 0)) for s in shapes]
        ys = [float(s.get("y", 0)) for s in shapes]
        min_x, max_x = min(xs), max(xs) + 220.0
        min_y, max_y = min(ys), max(ys) + 140.0
        span_x = max(1.0, max_x - min_x)
        span_y = max(1.0, max_y - min_y)

        for s in shapes:
            sx = int(24 + ((float(s.get("x", 0)) - min_x) / span_x) * 380)
            sy = int(24 + ((float(s.get("y", 0)) - min_y) / span_y) * 210)
            sw = max(28, int((float(s.get("w", 160)) / span_x) * 380))
            sh = max(20, int((float(s.get("h", 100)) / span_y) * 210))
            c = color_map.get(s.get("color", "light-blue"), "#38bdf8")
            draw.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=6, outline=c, width=3)
        return img

    def handle_vision_harmonize(self, params: dict) -> dict:
        if not self.gemma_ready or self.gemma is None:
            raise RuntimeError("EmbeddingGemma 2 warming up")
        t0 = time.perf_counter()
        img_b64 = params.get("imageBase64")
        shapes = params.get("canvasShapes", [])
        bg_hex = params.get("canvasBg", "#08101d")
        goal_prompt = params.get("goalPrompt", " cohesive high-contrast architectural diagram")

        pil_img = None
        if img_b64:
            try:
                raw_bytes = base64.b64decode(img_b64.split(",")[-1])
                pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            except Exception:
                pil_img = None
        if pil_img is None:
            pil_img = self._render_synthetic_canvas_snapshot(shapes, bg_hex)

        shape_summary = ", ".join(
            f"{s.get('label', 'Node')} ({s.get('geo') or s.get('type', 'box')}, {s.get('color', 'blue')})"
            for s in shapes[:12]
        ) or "empty canvas"

        if os.environ.get("GEMMA_TEXT_ONLY", "0") == "1":
            mm_vec = self._encode_query(f"Canvas layout: {shape_summary}. Target aesthetic: {goal_prompt}")
        else:
            multimodal_input = {
                "text": f"Canvas visual design snapshot with nodes: {shape_summary}. Target vibe: {goal_prompt} <|image|>",
                "image": [pil_img],
            }
            mm_vec = np.asarray(
                self.gemma.encode(multimodal_input, normalize_embeddings=True),
                dtype=np.float32,
            )

        theme_scores = self._scores_dict(self.theme_ids, self.theme_mat, mm_vec)
        critique_scores = self._scores_dict(self.critique_ids, self.critique_mat, mm_vec)

        best_theme_id = max(theme_scores, key=theme_scores.get) if theme_scores else "blueprint-dark"
        best_critique_id = max(critique_scores, key=critique_scores.get) if critique_scores else "balanced-hierarchy"
        critique_obj = next((c for c in self.critique_specs if c["id"] == best_critique_id), self.critique_specs[0])

        return {
            "bestThemeId": best_theme_id,
            "themeScores": theme_scores,
            "critiqueId": best_critique_id,
            "critiqueTitle": critique_obj["title"],
            "critiqueDescription": critique_obj["description"],
            "critiqueScores": critique_scores,
            "modelUsed": f"google/embeddinggemma-2 ({self.device})",
            "latencyMs": round((time.perf_counter() - t0) * 1000, 1),
        }


def main():
    catalog_raw = sys.stdin.readline()
    catalog = json.loads(catalog_raw) if catalog_raw.strip() else {}
    server = MLBridgeServer(catalog)
    emit(
        {
            "ready": True,
            "device": server.device,
            "dtype": str(server.dtype).replace("torch.", ""),
            "earlybirdLoadMs": server.eb_load_ms,
            "embeddingGemmaLoadMs": server.gemma_load_ms,
            "gemmaReady": server.gemma_ready,
        }
    )

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            msg = json.loads(line)
            req_id = msg.get("id")
            method = msg.get("method")
            params = msg.get("params", {})

            if method == "audio_chunk":
                res = server.handle_audio_chunk(params)
            elif method == "audio_reset":
                res = server.handle_audio_reset(params)
            elif method == "score_utterance":
                res = server.handle_score_utterance(params)
            elif method == "vision_harmonize":
                res = server.handle_vision_harmonize(params)
            elif method == "status":
                res = {
                    "ok": True,
                    "device": server.device,
                    "dtype": str(server.dtype).replace("torch.", ""),
                    "earlybird": "sahilmahendrakar/Earlybird-29M",
                    "embeddingGemma": "google/embeddinggemma-2",
                    "gemmaReady": server.gemma_ready,
                }
            else:
                raise ValueError(f"Unknown method: {method}")

            emit({"id": req_id, "result": res})
        except Exception as e:
            emit({"id": req_id, "error": str(e), "trace": traceback.format_exc()})


if __name__ == "__main__":
    main()
