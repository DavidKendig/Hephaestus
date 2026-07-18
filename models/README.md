# Models

Local model weights live here. Weight files (`*.safetensors`, `*.gguf`)
are gitignored — only this documentation is tracked.

**No weights ship with Hephaestus.** They are used for testing the image
features locally; you must obtain the model weights yourself (subject to
their own licenses) and place them in the folders described below.

## `image/`

Image-generation models hosted directly by the Hephaestus backend
(`backend/imagegen.py`). Each model gets its own subfolder; Ideogram 4
expects:

```
image/ideogram-4/
  transformer.safetensors                the conditional DiT
  unconditional_transformer.safetensors  the guidance DiT
  text_encoder.safetensors               Qwen3-VL-8B (fp8 scaled)
  vae.safetensors                        32-channel flux2 VAE
```

The files are the ComfyUI "fp8 scaled" distribution; the backend adapts
them to the official `ideogram4` runtime format at load time. Override
the location with the `HEPH_IMAGE_MODELS_DIR` environment variable.

## `chat/`

Reserved for locally hosted chat model weights. Chat models are
currently served by Ollama (which manages its own storage), so this
folder is empty for now.
