"""Local image generation: the backend hosts diffusion models in-process.

Currently supports Ideogram 4 through the official `ideogram4` runtime
(fp8 build, which runs on any hardware — CUDA, Apple Silicon or CPU).
The heavy dependencies are optional: install them with

    pip install -r backend/requirements-image.txt

Weights are loaded from local safetensors files (ComfyUI "fp8 scaled"
distribution) placed in models/image/<model>/ at the project root:

    transformer.safetensors               the conditional DiT
    unconditional_transformer.safetensors the guidance DiT
    text_encoder.safetensors              Qwen3-VL-8B (fp8 scaled)
    vae.safetensors                       the 32-channel VAE (flux2-vae)

Only the small tokenizer/config files come from Hugging Face (public,
ungated Qwen repo); they are cached after the first load.
"""

import base64
import gc
import io
import os
import threading

MODELS_DIR = os.environ.get(
    "HEPH_IMAGE_MODELS_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__),
                                 "..", "models", "image")),
)

# Public repo used only for the text-encoder config + tokenizer (a few
# MB of JSON); the 10 GB of encoder weights load from the local file.
QWEN_REPO = "Qwen/Qwen3-VL-8B-Instruct"

WEIGHT_FILES = (
    "transformer.safetensors",
    "unconditional_transformer.safetensors",
    "text_encoder.safetensors",
    "vae.safetensors",
)

IMAGE_MODELS = [
    {
        "id": "ideogram-4",
        "name": "Ideogram 4 (fp8)",
        "dir": os.path.join(MODELS_DIR, "ideogram-4"),
    },
]

# One model in memory and one generation at a time: these models take
# tens of GB of RAM, and parallel runs would thrash the machine.
_lock = threading.Lock()
_pipeline = None
_pipeline_id: str | None = None


def deps_installed() -> bool:
    try:
        import ideogram4  # noqa: F401
        import torch  # noqa: F401
        return True
    except ImportError:
        return False


def _weights_present(model_dir: str) -> bool:
    return all(os.path.isfile(os.path.join(model_dir, f))
               for f in WEIGHT_FILES)


def list_models() -> list[dict]:
    return [{
        "id": m["id"],
        "name": m["name"],
        "dir": m["dir"],
        "weights_present": _weights_present(m["dir"]),
        "loaded": _pipeline_id == m["id"],
    } for m in IMAGE_MODELS]


def _find_model(key: str) -> dict:
    for m in IMAGE_MODELS:
        if key in (m["id"], m["name"]):
            return m
    raise ValueError(f"Unknown image model: {key}")


def _device() -> str:
    import torch
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _default_preset():
    """The lightest sampler preset — kindest to CPU-only machines."""
    try:
        from ideogram4 import PRESETS
        return min(
            PRESETS.values(),
            key=lambda p: getattr(p, "num_steps", 1 << 30),
        )
    except Exception:
        return None


def _prep_comfy_fp8(state_dict: dict) -> dict:
    """Adapt a ComfyUI 'fp8 scaled' checkpoint to the ideogram4 runtime.

    ComfyUI stores one scalar scale per quantized weight and adds
    `.comfy_quant` marker tensors; the runtime expects per-output-row
    scale vectors and no extras. Expanding the scalar is lossless:
    dequantization is `weight * scale` either way.
    """
    out = {}
    for key, value in state_dict.items():
        if key.endswith(".comfy_quant"):
            continue
        if key.endswith(".weight_scale") and value.dim() == 0:
            weight = state_dict[key[: -len(".weight_scale")] + ".weight"]
            value = value.reshape(1).expand(weight.shape[0]).clone()
        out[key] = value
    return out


def _remap_qwen_keys(state_dict: dict) -> dict:
    """ComfyUI text-encoder naming -> transformers Qwen3VLModel naming."""
    out = {}
    for key, value in state_dict.items():
        if key == "lm_head.weight":
            continue  # Qwen3VLModel has no LM head; only hidden states used
        if key.startswith("model.visual."):
            key = key[len("model."):]
        elif key.startswith("model."):
            key = "language_model." + key[len("model."):]
        out[key] = value
    return out


def _shim_causal_mask() -> None:
    """Bridge transformers API drift the ideogram4 runtime hasn't caught
    up with. Installed transformers (4.57/5.1) names the embeddings
    parameter input_embeds (runtime says inputs_embeds) and requires
    cache_position, which the runtime omits — for a full-sequence pass
    with no KV cache that is simply arange(seq_len)."""
    import inspect
    import torch
    import ideogram4.pipeline_ideogram4 as pl
    from transformers.masking_utils import create_causal_mask as ccm

    params = inspect.signature(ccm).parameters

    def compat_create_causal_mask(*args, **kwargs):
        embeds = kwargs.get("inputs_embeds", kwargs.get("input_embeds"))
        if "inputs_embeds" in kwargs and "inputs_embeds" not in params:
            kwargs["input_embeds"] = kwargs.pop("inputs_embeds")
        if ("cache_position" in params and "cache_position" not in kwargs
                and embeds is not None):
            kwargs["cache_position"] = torch.arange(
                embeds.shape[1], device=embeds.device)
        return ccm(*args, **kwargs)

    pl.create_causal_mask = compat_create_causal_mask


def _load(model_key: str, progress) -> object:
    global _pipeline, _pipeline_id
    spec = _find_model(model_key)
    if _pipeline is not None and _pipeline_id == spec["id"]:
        return _pipeline
    if not _weights_present(spec["dir"]):
        missing = [f for f in WEIGHT_FILES
                   if not os.path.isfile(os.path.join(spec["dir"], f))]
        raise RuntimeError(
            f"Model weights missing from {spec['dir']}: {', '.join(missing)}"
        )

    import torch
    from safetensors.torch import load_file
    from transformers import AutoConfig, AutoModel, AutoTokenizer
    from ideogram4.modeling_ideogram4 import Ideogram4Config
    from ideogram4.pipeline_ideogram4 import (
        Ideogram4Pipeline,
        Ideogram4PipelineConfig,
        _build_transformer,
        _load_autoencoder,
    )
    from ideogram4.quantized_loading import (
        load_fp8_state_dict,
        swap_linears_to_fp8,
    )

    _shim_causal_mask()

    # Free the previous model before loading a new one.
    _pipeline = None
    _pipeline_id = None
    gc.collect()

    device = torch.device(_device())
    dtype = torch.bfloat16
    path = lambda f: os.path.join(spec["dir"], f)  # noqa: E731

    progress("Loading transformer (1/4)…")
    sd = _prep_comfy_fp8(load_file(path("transformer.safetensors")))
    conditional = _build_transformer(Ideogram4Config(), sd, device, dtype)
    del sd
    gc.collect()

    progress("Loading unconditional transformer (2/4)…")
    sd = _prep_comfy_fp8(
        load_file(path("unconditional_transformer.safetensors")))
    unconditional = _build_transformer(Ideogram4Config(), sd, device, dtype)
    del sd
    gc.collect()

    progress("Loading Qwen3-VL text encoder (3/4)…")
    tokenizer = AutoTokenizer.from_pretrained(QWEN_REPO)
    config = AutoConfig.from_pretrained(QWEN_REPO, trust_remote_code=True)
    text_encoder = AutoModel.from_config(config, trust_remote_code=True)
    sd = _remap_qwen_keys(
        _prep_comfy_fp8(load_file(path("text_encoder.safetensors"))))
    swap_linears_to_fp8(text_encoder, sd, compute_dtype=dtype)
    load_fp8_state_dict(text_encoder, sd, device=device, dtype=dtype,
                        assign=True, strict=False)
    text_encoder.eval()
    del sd
    gc.collect()

    progress("Loading VAE (4/4)…")
    autoencoder = _load_autoencoder(path("vae.safetensors"), device, dtype)

    _pipeline = Ideogram4Pipeline(
        conditional_transformer=conditional,
        unconditional_transformer=unconditional,
        text_encoder=text_encoder,
        text_tokenizer=tokenizer,
        autoencoder=autoencoder,
        config=Ideogram4PipelineConfig(),
        device=device,
        dtype=dtype,
    )
    _pipeline_id = spec["id"]
    return _pipeline


def _count_steps(pipe, steps: int, progress):
    """Wrap the transformer so each denoising step reports progress.

    The runtime has no step callback, so we count forward passes of the
    conditional transformer instead. Purely cosmetic — if the internals
    ever change, generation still works without step numbers.
    """
    target = getattr(pipe, "conditional_transformer",
                     getattr(pipe, "transformer", None))
    if target is None or not hasattr(target, "forward"):
        return lambda: None
    orig = target.forward
    count = {"n": 0}

    def counted(*args, **kwargs):
        count["n"] += 1
        progress(f"Generating… step {min(count['n'], steps)}/{steps}")
        return orig(*args, **kwargs)

    target.forward = counted
    return lambda: setattr(target, "forward", orig)


def _fit_schedule(schedule, steps: int) -> list[float]:
    """Linearly resample a per-step guidance schedule to `steps` entries."""
    vals = [float(v) for v in schedule]
    if len(vals) == steps:
        return vals
    if steps == 1 or len(vals) == 1:
        return [vals[-1]] * steps
    out = []
    for i in range(steps):
        pos = i * (len(vals) - 1) / (steps - 1)
        lo = int(pos)
        hi = min(lo + 1, len(vals) - 1)
        out.append(vals[lo] + (vals[hi] - vals[lo]) * (pos - lo))
    return out


def generate(model_key: str, prompt: str, *,
             width: int = 1024, height: int = 1024,
             seed: int | None = None, num_steps: int | None = None,
             progress=lambda msg: None) -> str:
    """Generate one image and return it as a PNG data URL."""
    with _lock:
        pipe = _load(model_key, progress)

        preset = _default_preset()
        steps = num_steps or getattr(preset, "num_steps", None) or 32
        kwargs = {
            "height": height,
            "width": width,
            "num_steps": steps,
            "seed": seed,
            "raise_on_caption_issues": False,
        }
        for field in ("mu", "std"):
            if preset is not None and hasattr(preset, field):
                kwargs[field] = getattr(preset, field)
        if preset is not None and hasattr(preset, "guidance_schedule"):
            kwargs["guidance_schedule"] = _fit_schedule(
                preset.guidance_schedule, steps)

        progress(f"Generating {width}×{height} image ({steps} steps)…")
        restore = _count_steps(pipe, steps, progress)
        try:
            images = pipe(prompt, **kwargs)
        finally:
            restore()

        buf = io.BytesIO()
        images[0].save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/png;base64,{b64}"
