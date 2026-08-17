"""Independent Krea2 random LoRA loader with property-backed selection."""

from __future__ import annotations

import random
from typing import Any

import comfy.sd
import comfy.utils
import folder_paths

from .random_lora_model_only import (
    SELECTION_PROPERTY_KEY,
    _canonical_filename,
    lora_folder_options,
    resolve_candidates,
    selection_from_workflow_properties,
)


class Krea2RandomLoraLoader:
    """A standalone node: model + strength + a frontend selection button."""

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("model", "selected_lora")
    OUTPUT_TOOLTIPS = (
        "应用本次 Krea2 LoRA 后的模型。",
        "本次实际加载的 LoRA 相对路径，可连接 Show Text。",
    )
    FUNCTION = "load_random_lora"
    CATEGORY = "Krea2/loaders"
    DESCRIPTION = (
        "Krea2 专用独立随机 LoRA 加载器。点击选择按钮打开 LoRA 树；"
        "单条固定，多条每次执行随机。Krea2 LoRA 不需要触发词。"
    )
    SEARCH_ALIASES = [
        "Krea2 random LoRA",
        "Krea2随机LoRA",
        "Krea2 LoRA loader",
    ]

    def __init__(self):
        self.loaded_lora = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "selection_button": (
                    "KREA2_LORA_BUTTON",
                    {
                        "default": "选择 LoRA",
                        "lora_files": list(folder_paths.get_filename_list("loras")),
                        "tooltip": "点击打开 Krea2 LoRA 选择列表。",
                    },
                ),
                "strength_model": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -100.0,
                        "max": 100.0,
                        "step": 0.01,
                        "tooltip": "模型强度。",
                    },
                ),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @staticmethod
    def _selection(unique_id: Any, extra_pnginfo: Any):
        return selection_from_workflow_properties(unique_id, extra_pnginfo) or "人物"

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # Selection is property-backed and can contain multiple files/folders.
        # Force one fresh choice for every queued execution.
        return float("nan")

    def _load_payload(self, selected_lora: str):
        lora_path = folder_paths.get_full_path_or_raise("loras", selected_lora)
        if self.loaded_lora is not None and self.loaded_lora[0] == lora_path:
            return self.loaded_lora[1], self.loaded_lora[2]
        lora, metadata = comfy.utils.load_torch_file(
            lora_path,
            safe_load=True,
            return_metadata=True,
        )
        self.loaded_lora = (lora_path, lora, metadata)
        return lora, metadata

    def load_random_lora(
        self,
        model,
        strength_model,
        unique_id=None,
        extra_pnginfo=None,
    ):
        selection = self._selection(unique_id, extra_pnginfo)
        candidates = resolve_candidates(selection)
        selected_lora = random.choice(candidates)
        if strength_model == 0:
            return model, selected_lora
        lora, metadata = self._load_payload(selected_lora)
        model_lora, _ = comfy.sd.load_lora_for_models(
            model,
            None,
            lora,
            strength_model,
            0,
            lora_metadata=metadata,
        )
        return model_lora, selected_lora
