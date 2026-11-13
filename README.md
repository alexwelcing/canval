# Canval (`carbon`) — The Spoken Canvas

Zero-button, voice-controlled **tldraw** canvas framed inside an archival gallery mat and powered by a **three-model pipeline**:

1. **Earlybird-29M (`public/models/earlybird/`, Browser ONNX WASM)** — Predictive `-90ms` streaming speech-to-text at 80 ms frame steps with word-level confidence scores and speculative ghost word predictions.
2. **EmbeddingGemma 2 (`onnx-community/embeddinggemma-2-ONNX`, WebGPU/WASM `q4`)** — 768d & 256d Matryoshka (MRL) visual designer mapping spoken moods and intents to 8 Gallery Aesthetic Editions, 9 Layout Blueprints, 13 Shape Archetypes, 13 Color Tokens, 10 Kinetic Motion Profiles, and semantic canvas shape grounding.
3. **Qwen Canvas State Computer (`onnx-community/Qwen2.5-0.5B-Instruct-ONNX` WebGPU + Cloudflare Workers AI `@cf/qwen/qwen2.5-coder-32b-instruct`)** — Maintains a symbolic CPU-style Canvas Register File (`s1, s2, ...`, `FOCUS`, `EDITION`, `ANIMS`) and compiles natural voice commands into verified Canvas RISC syscalls (`SPAWN`, `LAYOUT`, `MOVE`, `PLACE`, `SWAP`, `ANIM`, `TEMPO`, `STOP_ANIM`, `CONNECT`, `LOCK`, `DELETE`, `CLEAR`, `NOOP`).

## Safety Invariants
- **Zero Self-Removal:** Speculative ghost previews crystallize into permanent shapes rather than disappearing on pause, and destructive instructions (`DELETE`, `CLEAR`, `UNDO`) are hardware-gated behind explicit, high-confidence spoken verbs (`delete`, `remove`, `erase`, `clear canvas`, `undo`).
- **Shape Locking:** Say *"lock that shape"* or *"pin everything"* to protect shapes from movement or deletion.

## Spoken Capabilities
- **Create & Compose:** *"Draw a blue circle"*, *"Create three cards called Auth, API, and Postgres"*, *"Sketch a system architecture diagram"*, *"Make a mindmap"*.
- **Move & Position:** *"Move the circle to the top right"*, *"Nudge it left a tiny bit"*, *"Move Postgres below the API"*, *"Swap Auth and Postgres"*.
- **60fps Kinetic Animations:** *"Make the moon orbit around the earth"*, *"Make everything float gently"*, *"Spin the diamond"*, *"Make that heart pulse"*, *"Bounce the star"*, *"Swing like a pendulum"*, *"Dance in a figure eight"*, *"Faster"*, *"Stop animating"*.
- **Gallery Aesthetics:** *"Bauhaus modernist"*, *"Kyoto sumi ink on washi"*, *"Clean Swiss Kunsthalle"*, *"Cyanotype blueprint"*, *"Dark obsidian monolith"*, *"Milan travertine"*, *"Chalkboard sketch"*, *"Dieter Rams industrial"*.

## Commands

```bash
pnpm install
pnpm run dev      # Local HTTPS dev server for mobile mic access
pnpm run build    # TypeScript 7 + Vite 8 production bundle
pnpm run deploy   # Build + deploy Worker & Static Assets to Cloudflare
```
