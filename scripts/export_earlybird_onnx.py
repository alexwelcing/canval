"""
Export sahilmahendrakar/Earlybird-29M to compact, browser-ready ONNX graphs
(WASM SIMD + WebGPU compatible via onnxruntime-web) and verify step-for-step
streaming parity against the reference PyTorch `earlybird.py` implementation.
"""
import json
import math
import os
import shutil
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "earlybird_src"))
from earlybird import Earlybird, STEP, SR

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "models", "earlybird")


class FrontendFrameModule(nn.Module):
    """Maps 5ms audio frames [1, N, 80] -> [1, 320, N] before causal convs."""
    def __init__(self, embedder):
        super().__init__()
        self.cmvn = embedder.cmvn
        self.comp = embedder.comp
        self.linear = embedder.linear

    def forward(self, frames: torch.Tensor) -> torch.Tensor:
        # frames: [1, N, 80]
        normed = self.cmvn(frames)
        u = torch.exp(self.comp.log_k) * normed
        # Numerically stable identity for asinh(u) compatible with WebGPU & WASM ONNX EPs:
        comp = torch.sign(u) * torch.log(torch.abs(u) + torch.sqrt(u * u + 1.0))
        h = F.silu(self.linear(comp))
        return h.transpose(1, 2)  # [1, 320, N]


class FrontendConv1Module(nn.Module):
    """Causal conv1 segment [1, 320, L] -> silu(conv1(seg)) [1, 640, Out]."""
    def __init__(self, conv1):
        super().__init__()
        self.weight = conv1.weight
        self.bias = conv1.bias
        self.stride = conv1.stride[0]

    def forward(self, seg: torch.Tensor) -> torch.Tensor:
        return F.silu(F.conv1d(seg, self.weight, self.bias, stride=self.stride))


class FrontendConv2Module(nn.Module):
    """Causal conv2 segment [1, 640, L] -> conv2(seg).transpose(1, 2) [1, Out, 320]."""
    def __init__(self, conv2):
        super().__init__()
        self.weight = conv2.weight
        self.bias = conv2.bias
        self.stride = conv2.stride[0]

    def forward(self, seg: torch.Tensor) -> torch.Tensor:
        return F.conv1d(seg, self.weight, self.bias, stride=self.stride).transpose(1, 2)


class SingleEncoderLayerHelper(nn.Module):
    def __init__(self, layer, num_heads: int, head_dim: int, back: int, ahead: int):
        super().__init__()
        self.layer = layer
        self.H = num_heads
        self.hd = head_dim
        self.scale = 1.0 / math.sqrt(head_dim)
        self.back = back
        self.ahead = ahead

    def forward(self, x: torch.Tensor, q_idx: torch.Tensor) -> torch.Tensor:
        # x: [1, T, 320], q_idx: [nq] int64
        a = self.layer.self_attn
        h = self.layer.input_layernorm(x)
        T = h.shape[1]
        hq = torch.index_select(h, 1, q_idx)
        xq = torch.index_select(x, 1, q_idx)
        nq = q_idx.shape[0]

        q = a.q_proj(hq).view(1, nq, self.H, self.hd).transpose(1, 2)
        k = a.k_proj(h).view(1, T, self.H, self.hd).transpose(1, 2)
        v = a.v_proj(h).view(1, T, self.H, self.hd).transpose(1, 2)

        k_idx = torch.arange(T, device=x.device, dtype=torch.long)
        dist = q_idx[:, None] - k_idx[None, :]
        valid = ((dist >= 0) & (dist < self.back)) | ((dist < 0) & ((-dist) <= self.ahead))
        bias = torch.where(
            valid,
            torch.zeros(1, dtype=x.dtype, device=x.device),
            torch.tensor(-1e9, dtype=x.dtype, device=x.device),
        ).unsqueeze(0).unsqueeze(0)

        scores = torch.matmul(q, k.transpose(-2, -1)) * self.scale + bias
        probs = F.softmax(scores, dim=-1)
        o = torch.matmul(probs, v).transpose(1, 2).reshape(1, nq, self.H * self.hd)

        y = xq + a.o_proj(o)
        return y + self.layer.mlp(self.layer.post_attention_layernorm(y))


class EncoderStepModule(nn.Module):
    """Runs all 6 sliding-window encoder layers in one ONNX call using pure Gather indexing."""
    def __init__(self, enc, num_heads: int, head_dim: int, back_list, ahead_list):
        super().__init__()
        self.layers = nn.ModuleList([
            SingleEncoderLayerHelper(layer, num_heads, head_dim, back_list[i], ahead_list[i])
            for i, layer in enumerate(enc.layers)
        ])

    def forward(
        self,
        win0: torch.Tensor, q_idx0: torch.Tensor, fin_idx0: torch.Tensor, prov_idx0: torch.Tensor,
        win1: torch.Tensor, q_idx1: torch.Tensor, fin_idx1: torch.Tensor, prov_idx1: torch.Tensor,
        win2: torch.Tensor, q_idx2: torch.Tensor, fin_idx2: torch.Tensor, prov_idx2: torch.Tensor,
        win3: torch.Tensor, q_idx3: torch.Tensor, fin_idx3: torch.Tensor, prov_idx3: torch.Tensor,
        win4: torch.Tensor, q_idx4: torch.Tensor, fin_idx4: torch.Tensor, prov_idx4: torch.Tensor,
        win5: torch.Tensor, q_idx5: torch.Tensor, fin_idx5: torch.Tensor, prov_idx5: torch.Tensor,
        prov0: torch.Tensor,
    ):
        wins = [win0, win1, win2, win3, win4, win5]
        q_idxs = [q_idx0, q_idx1, q_idx2, q_idx3, q_idx4, q_idx5]
        fin_idxs = [fin_idx0, fin_idx1, fin_idx2, fin_idx3, fin_idx4, fin_idx5]
        prov_idxs = [prov_idx0, prov_idx1, prov_idx2, prov_idx3, prov_idx4, prov_idx5]

        new_fins = []
        prov = prov0
        for i, layer in enumerate(self.layers):
            win_i = wins[i] if i == 0 else torch.cat([wins[i], new_fins[i - 1]], dim=1)
            x = torch.cat([win_i, prov], dim=1)
            y = layer(x, q_idxs[i])
            new_fins.append(torch.index_select(y, 1, fin_idxs[i]))
            prov = torch.index_select(y, 1, prov_idxs[i])

        return (*new_fins, prov)


class CrossKVModule(nn.Module):
    """Projects encoder frames [1, N, 320] at positions pos_ids [N] into 6-layer cross K/V."""
    def __init__(self, enc, dec, num_heads: int, head_dim: int):
        super().__init__()
        self.final_norm = enc.final_norm
        self.pos_weight = dec.pos_emb.weight
        self.proj = dec.proj
        self.H = num_heads
        self.hd = head_dim
        self.k_projs = nn.ModuleList([l.encoder_attn.k_proj for l in dec.layers])
        self.v_projs = nn.ModuleList([l.encoder_attn.v_proj for l in dec.layers])

    def forward(self, enc_frames: torch.Tensor, pos_ids: torch.Tensor):
        # enc_frames: [1, N, 320], pos_ids: [N]
        N = enc_frames.shape[1]
        pos_emb = F.embedding(pos_ids, self.pos_weight).unsqueeze(0)
        x = self.proj(self.final_norm(enc_frames) + pos_emb)
        ks, vs = [], []
        for kp, vp in zip(self.k_projs, self.v_projs):
            ks.append(kp(x).view(1, N, self.H, self.hd).transpose(1, 2))
            vs.append(vp(x).view(1, N, self.H, self.hd).transpose(1, 2))
        return torch.stack(ks, dim=0), torch.stack(vs, dim=0)


class DecoderStepModule(nn.Module):
    """Incremental + parallel verification decoder step with partial RoPE and KV cache."""
    def __init__(self, model, num_heads: int, head_dim: int):
        super().__init__()
        dec = model.model.decoder
        self.embed_tokens = dec.embed_tokens
        self.layers = dec.layers
        self.norm = dec.norm
        self.proj_out = model.proj_out
        self.register_buffer("inv_freq", dec.rotary_emb.inv_freq.float(), persistent=False)
        self.H = num_heads
        self.hd = head_dim
        self.scale = 1.0 / math.sqrt(head_dim)
        self.rot_dim = int(dec.rotary_emb.inv_freq.numel() * 2)  # 32

    def _rope(self, x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
        # x: [1, H, L, hd], cos/sin: [1, 1, L, rot_dim]
        xr = x[..., :self.rot_dim]
        xp = x[..., self.rot_dim:]
        x_even = xr[..., 0::2]
        x_odd = xr[..., 1::2]
        rot = torch.stack((-x_odd, x_even), dim=-1).reshape_as(xr)
        out_r = xr * cos + rot * sin
        return torch.cat([out_r, xp], dim=-1)

    def forward(
        self,
        input_ids: torch.Tensor,    # [1, L]
        pos_ids: torch.Tensor,      # [L]
        past_k: torch.Tensor,       # [6, 1, 8, P, 40]
        past_v: torch.Tensor,       # [6, 1, 8, P, 40]
        attn_bias: torch.Tensor,    # [1, 1, L, P + L]
        cross_k: torch.Tensor,      # [6, 1, 8, T_enc, 40]
        cross_v: torch.Tensor,      # [6, 1, 8, T_enc, 40]
    ):
        x = self.embed_tokens(input_ids)
        L = input_ids.shape[1]

        fr = pos_ids[:, None].float() * self.inv_freq[None, :]
        cos = torch.stack([fr.cos(), fr.cos()], dim=-1).reshape(1, 1, L, self.rot_dim)
        sin = torch.stack([fr.sin(), fr.sin()], dim=-1).reshape(1, 1, L, self.rot_dim)

        pres_k, pres_v = [], []
        for i, layer in enumerate(self.layers):
            a = layer.self_attn
            h = layer.input_layernorm(x)
            q = self._rope(a.q_proj(h).view(1, L, self.H, self.hd).transpose(1, 2), cos, sin)
            k = self._rope(a.k_proj(h).view(1, L, self.H, self.hd).transpose(1, 2), cos, sin)
            v = a.v_proj(h).view(1, L, self.H, self.hd).transpose(1, 2)

            k_cat = torch.cat([past_k[i], k], dim=2)
            v_cat = torch.cat([past_v[i], v], dim=2)
            pres_k.append(k_cat)
            pres_v.append(v_cat)

            scores = torch.matmul(q, k_cat.transpose(-2, -1)) * self.scale + attn_bias
            probs = F.softmax(scores, dim=-1)
            o = torch.matmul(probs, v_cat).transpose(1, 2).reshape(1, L, self.H * self.hd)
            x = x + a.o_proj(o)

            c = layer.encoder_attn
            qc = c.q_proj(layer.post_attention_layernorm(x)).view(1, L, self.H, self.hd).transpose(1, 2)
            scores_c = torch.matmul(qc, cross_k[i].transpose(-2, -1)) * self.scale
            probs_c = F.softmax(scores_c, dim=-1)
            oc = torch.matmul(probs_c, cross_v[i]).transpose(1, 2).reshape(1, L, self.H * self.hd)
            x = x + c.o_proj(oc)

            x = x + layer.mlp(layer.final_layernorm(x))

        logits = self.proj_out(self.norm(x))[0]  # [L, vocab_size]
        return logits, torch.stack(pres_k, dim=0), torch.stack(pres_v, dim=0)


def export_onnx_model(mod, args, path, input_names, output_names, dynamic_axes):
    mod.eval()
    torch.onnx.export(
        mod,
        args,
        path,
        input_names=input_names,
        output_names=output_names,
        dynamic_axes=dynamic_axes,
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    src_dir = os.path.join(os.path.dirname(__file__), "earlybird_src")
    eb = Earlybird.from_pretrained(src_dir)
    m = eb.model.eval()
    enc = m.model.encoder
    dec = m.model.decoder
    cfg = m.config
    ecfg = cfg.encoder_config

    H = cfg.num_attention_heads
    hd = cfg.head_dim
    back = [w[0] for w in ecfg.sliding_windows]
    ahead = [max(0, w[1] - 1) for w in ecfg.sliding_windows]

    print("Exporting frontend_frame.onnx...")
    fe_frame = FrontendFrameModule(enc.embedder)
    export_onnx_model(
        fe_frame,
        (torch.randn(1, 16, 80),),
        os.path.join(OUT_DIR, "frontend_frame.onnx"),
        ["frames"],
        ["hidden"],
        {"frames": {1: "n_frames"}, "hidden": {2: "n_frames"}},
    )

    print("Exporting frontend_conv1.onnx...")
    fe_c1 = FrontendConv1Module(enc.embedder.conv1)
    export_onnx_model(
        fe_c1,
        (torch.randn(1, 320, 19),),
        os.path.join(OUT_DIR, "frontend_conv1.onnx"),
        ["seg"],
        ["out"],
        {"seg": {2: "seg_len"}, "out": {2: "out_len"}},
    )

    print("Exporting frontend_conv2.onnx...")
    fe_c2 = FrontendConv2Module(enc.embedder.conv2)
    export_onnx_model(
        fe_c2,
        (torch.randn(1, 640, 11),),
        os.path.join(OUT_DIR, "frontend_conv2.onnx"),
        ["seg"],
        ["out"],
        {"seg": {2: "seg_len"}, "out": {1: "out_len"}},
    )

    print("Exporting encoder_step.onnx...")
    enc_step = EncoderStepModule(enc, H, hd, back, ahead)
    enc_inputs = []
    in_names = []
    dyn = {}
    for i in range(6):
        # For i > 0, win_i is concatenated with new_fin_{i-1} (4 frames), so pass 15 frames for i > 0 -> 15 + 4 + 3 = 22
        w_dummy = 19 if i == 0 else 15
        enc_inputs.extend([
            torch.randn(1, w_dummy, 320),
            torch.arange(15, 22, dtype=torch.long),
            torch.arange(0, 4, dtype=torch.long),
            torch.arange(4, 7, dtype=torch.long),
        ])
        in_names.extend([f"win{i}", f"q_idx{i}", f"fin_idx{i}", f"prov_idx{i}"])
        dyn[f"win{i}"] = {1: f"win_len_{i}"}
        dyn[f"q_idx{i}"] = {0: f"nq_{i}"}
        dyn[f"fin_idx{i}"] = {0: f"nfin_{i}"}
        dyn[f"prov_idx{i}"] = {0: f"nprov_{i}"}
        dyn[f"new_fin{i}"] = {1: f"nfin_{i}"}
    enc_inputs.append(torch.randn(1, 3, 320))
    in_names.append("prov0")
    dyn["prov0"] = {1: "prov0_len"}
    dyn["prov_out"] = {1: "nprov_5"}
    out_names = [*(f"new_fin{i}" for i in range(6)), "prov_out"]

    export_onnx_model(
        enc_step,
        tuple(enc_inputs),
        os.path.join(OUT_DIR, "encoder_step.onnx"),
        in_names,
        out_names,
        dyn,
    )

    print("Exporting cross_kv.onnx...")
    ckv = CrossKVModule(enc, dec, H, hd)
    export_onnx_model(
        ckv,
        (torch.randn(1, 4, 320), torch.arange(4, dtype=torch.long)),
        os.path.join(OUT_DIR, "cross_kv.onnx"),
        ["enc_frames", "pos_ids"],
        ["cross_k", "cross_v"],
        {
            "enc_frames": {1: "n_frames"},
            "pos_ids": {0: "n_frames"},
            "cross_k": {3: "n_frames"},
            "cross_v": {3: "n_frames"},
        },
    )

    print("Exporting decoder_step.onnx...")
    dec_step = DecoderStepModule(m, H, hd)
    export_onnx_model(
        dec_step,
        (
            torch.tensor([[1, 100, 200]], dtype=torch.long),
            torch.tensor([0, 1, 2], dtype=torch.long),
            torch.randn(6, 1, H, 2, hd),
            torch.randn(6, 1, H, 2, hd),
            torch.zeros(1, 1, 3, 5, dtype=torch.float32),
            torch.randn(6, 1, H, 12, hd),
            torch.randn(6, 1, H, 12, hd),
        ),
        os.path.join(OUT_DIR, "decoder_step.onnx"),
        ["input_ids", "pos_ids", "past_k", "past_v", "attn_bias", "cross_k", "cross_v"],
        ["logits", "present_k", "present_v"],
        {
            "input_ids": {1: "seq_len"},
            "pos_ids": {0: "seq_len"},
            "past_k": {3: "past_len"},
            "past_v": {3: "past_len"},
            "attn_bias": {2: "seq_len", 3: "total_len"},
            "cross_k": {3: "enc_len"},
            "cross_v": {3: "enc_len"},
            "logits": {0: "seq_len"},
            "present_k": {3: "total_len"},
            "present_v": {3: "total_len"},
        },
    )

    # Quantize heavy matmul models (encoder_step, cross_kv, decoder_step) to compact uint8
    from onnxruntime.quantization import quantize_dynamic, QuantType
    for name in ["encoder_step", "cross_kv", "decoder_step"]:
        fp32_path = os.path.join(OUT_DIR, f"{name}.onnx")
        q_path = os.path.join(OUT_DIR, f"{name}.quant.onnx")
        print(f"Quantizing {name}.onnx -> {name}.quant.onnx...")
        quantize_dynamic(
            model_input=fp32_path,
            model_output=q_path,
            weight_type=QuantType.QUInt8,
        )
        os.replace(q_path, fp32_path)

    # Copy tokenizer & write compact runtime metadata (including token word-start table!)
    shutil.copy2(os.path.join(src_dir, "tokenizer.json"), os.path.join(OUT_DIR, "tokenizer.json"))

    # Build fast vocab decode & word-start lookup table so the browser doesn't even need heavy tokenizer overhead
    vocab_size = cfg.vocab_size
    pieces = []
    word_starts = []
    for tid in range(vocab_size):
        raw_tok = eb.tok.convert_ids_to_tokens(tid)
        is_start = bool(raw_tok and raw_tok.startswith("▁"))
        word_starts.append(1 if is_start else 0)
        pieces.append(raw_tok if raw_tok is not None else "")

    runtime_meta = {
        "sample_rate": SR,
        "step_samples": STEP,
        "frame_len": int(enc.embedder.frame_len),
        "hidden_size": int(ecfg.hidden_size),
        "num_heads": H,
        "head_dim": hd,
        "num_layers": len(enc.layers),
        "bos_token_id": int(cfg.decoder_start_token_id),
        "eos_token_id": int(cfg.eos_token_id),
        "vocab_size": vocab_size,
        "conv1": {"kernel": int(enc.embedder.conv1.kernel_size[0]), "stride": int(enc.embedder.conv1.stride[0])},
        "conv2": {"kernel": int(enc.embedder.conv2.kernel_size[0]), "stride": int(enc.embedder.conv2.stride[0])},
        "back": back,
        "ahead": ahead,
        "pieces": pieces,
        "word_starts": word_starts,
    }
    with open(os.path.join(OUT_DIR, "earlybird_meta.json"), "w", encoding="utf-8") as f:
        json.dump(runtime_meta, f, ensure_ascii=False)

    print("\nExported files:")
    total_bytes = 0
    for fn in sorted(os.listdir(OUT_DIR)):
        sz = os.path.getsize(os.path.join(OUT_DIR, fn))
        total_bytes += sz
        print(f"  {fn:30s} {sz / (1024 * 1024):6.2f} MB")
    print(f"  TOTAL: {total_bytes / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    main()
