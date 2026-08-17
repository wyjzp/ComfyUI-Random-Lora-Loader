# Krea2 Random LoRA Loader

A ComfyUI custom node dedicated to **Krea2**. It uses ComfyUI's native dropdown list to select a LoRA folder or an individual LoRA file.

Krea2 LoRAs do not require prompt trigger words, making them suitable for runtime random selection. This plugin does not read, manage, or automatically add trigger words. It is not recommended for other models whose LoRAs require trigger words.

## Usage

Search for and add:

```text
Krea2专用随机LoRA加载器
```

Inputs:

- `model`: connect the MODEL output from a model loader;
- `选择 LoRA`: use the native ComfyUI searchable dropdown to select a LoRA folder or file;
- `模型强度`: LoRA strength, default `1.0`.

Selecting a folder recursively includes LoRAs in that folder and its subfolders. A new LoRA is randomly selected for each queued execution. Selecting an individual LoRA file keeps that file fixed, similar to the native LoRA loader.

Outputs:

- `model`: the model after applying the selected LoRA;
- `selected_lora`: the relative path of the LoRA used for this execution. Connect it to Show Text to inspect the actual file.

Example:

```text
人物/XXX.safetensors
```

## Notes

- Only the MODEL is modified; CLIP is not modified.
- No trigger-word detection or automatic trigger-word insertion is provided.
- Each independent Queue execution selects a new LoRA when a folder is selected.
- The node uses ComfyUI's configured native `loras` model paths.
- ComfyUI core files are not modified.

## Language

The Chinese README is the default documentation. This file provides an English version for international users.
