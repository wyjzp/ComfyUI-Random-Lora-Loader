"""Random or fixed model-only LoRA loading with safe tree selections."""

from __future__ import annotations

import random
import re
from pathlib import PurePosixPath, PureWindowsPath
from typing import Any, Iterable, Mapping

import comfy.sd
import comfy.utils
import folder_paths


SELECTION_VERSION = 1
NO_FOLDER_OPTION = "（没有可用的 LoRA 文件夹）"
WINDOWS_DRIVE_PATH = re.compile(r"^[A-Za-z]:")


def _parts(relative_name: str) -> tuple[str, ...]:
    """Split a ComfyUI-relative filename regardless of path separator."""
    normalized = str(relative_name).replace("\\", "/")
    return tuple(part for part in normalized.split("/") if part not in ("", "."))


def _canonical_path(path: Any) -> str:
    if not isinstance(path, str) or not path.strip():
        raise ValueError("LoRA 路径不能为空")
    raw = path.strip()
    if (
        raw.startswith(("/", "\\"))
        or WINDOWS_DRIVE_PATH.match(raw)
        or PurePosixPath(raw).is_absolute()
        or PureWindowsPath(raw).is_absolute()
    ):
        raise ValueError("LoRA 路径必须是相对路径")
    parts = _parts(raw)
    if not parts or ".." in parts:
        raise ValueError("LoRA 路径包含无效目录")
    return "/".join(parts)


def _canonical_filename(filename: str) -> str:
    return "/".join(_parts(filename))


def _filename_index(filenames: Iterable[str]) -> dict[str, str]:
    """Map canonical relative paths to the original ComfyUI registry values."""
    return {_canonical_filename(filename): filename for filename in filenames}


def lora_folder_options(filenames: Iterable[str] | None = None) -> list[str]:
    """Return every non-root relative parent directory containing LoRAs."""
    filenames = folder_paths.get_filename_list("loras") if filenames is None else filenames
    folders = set()
    for filename in filenames:
        parts = _parts(filename)
        for depth in range(1, len(parts)):
            folders.add("/".join(parts[:depth]))
    return sorted(folders)


def loras_in_folder(folder: str, filenames: Iterable[str] | None = None) -> list[str]:
    """Validate a folder and return all current LoRAs below it recursively."""
    filenames = list(
        folder_paths.get_filename_list("loras") if filenames is None else filenames
    )
    canonical_folder = _canonical_path(folder)
    allowed_folders = set(lora_folder_options(filenames))
    if canonical_folder not in allowed_folders:
        raise ValueError(f"LoRA 文件夹不存在或已失效：{folder}")

    prefix = (*_parts(canonical_folder),)
    candidates = [
        filename for filename in filenames
        if _parts(filename)[:len(prefix)] == prefix
    ]
    if not candidates:
        raise ValueError(f"LoRA 文件夹中没有可用文件：{folder}")
    return sorted(candidates)


def _unwrap_selection(value: Any) -> Any:
    if isinstance(value, Mapping) and "__value__" in value:
        return value["__value__"]
    return value


def normalize_selection(value: Any, filenames: Iterable[str] | None = None) -> list[tuple[str, str]]:
    """Parse new tree config plus legacy folder/file strings safely."""
    value = _unwrap_selection(value)
    filenames = list(
        folder_paths.get_filename_list("loras") if filenames is None else filenames
    )
    index = _filename_index(filenames)
    folders = set(lora_folder_options(filenames))

    if isinstance(value, str):
        canonical = _canonical_path(value)
        if canonical in index:
            return [("file", canonical)]
        if canonical in folders:
            return [("folder", canonical)]
        raise ValueError(f"LoRA 文件或文件夹不存在或已失效：{value}")

    if not isinstance(value, Mapping):
        raise ValueError("LoRA 选择配置格式无效")
    if value.get("version") != SELECTION_VERSION:
        raise ValueError("不支持的 LoRA 选择配置版本")
    entries = value.get("selected")
    if not isinstance(entries, list) or not entries:
        raise ValueError("请至少选择一个 LoRA 文件或文件夹")

    result: list[tuple[str, str]] = []
    seen = set()
    for entry in entries:
        if not isinstance(entry, Mapping):
            raise ValueError("LoRA 选择项格式无效")
        kind = entry.get("kind")
        path = _canonical_path(entry.get("path"))
        if kind == "file":
            if path not in index:
                raise ValueError(f"LoRA 文件不存在或已失效：{entry.get('path')}")
        elif kind == "folder":
            if path not in folders:
                raise ValueError(f"LoRA 文件夹不存在或已失效：{entry.get('path')}")
        else:
            raise ValueError("LoRA 选择项类型必须是 file 或 folder")
        if (kind, path) not in seen:
            seen.add((kind, path))
            result.append((kind, path))
    return result


def resolve_candidates(selection: Any, filenames: Iterable[str] | None = None) -> list[str]:
    """Expand exact files and recursive folders into sorted unique LoRA paths."""
    filenames = list(
        folder_paths.get_filename_list("loras") if filenames is None else filenames
    )
    index = _filename_index(filenames)
    selected = normalize_selection(selection, filenames)
    candidates: dict[str, str] = {}
    for kind, path in selected:
        if kind == "file":
            candidates[path] = index[path]
        else:
            for filename in loras_in_folder(path, filenames):
                candidates[_canonical_filename(filename)] = filename
    if not candidates:
        raise ValueError("没有可用的 LoRA 候选项")
    return [candidates[path] for path in sorted(candidates)]


class RandomLoraLoaderModelOnly:
    """Load fixed one-file or randomly selected multi-file MODEL-only LoRAs."""

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("model", "selected_lora")
    OUTPUT_TOOLTIPS = (
        "应用本次选择 LoRA 后的模型。",
        "本次实际加载的 LoRA 相对路径，可连接 Show Text。",
    )
    FUNCTION = "load_random_lora"
    CATEGORY = "model/loaders"
    DESCRIPTION = (
        "从右键选择的 LoRA 文件或文件夹中加载：单条时固定加载，多条时每次执行随机加载。"
        "仅修改 MODEL，不修改 CLIP。"
    )
    SEARCH_ALIASES = ["random lora", "随机 lora", "lora loader", "lora tree"]

    def __init__(self):
        self.loaded_lora = None

    @classmethod
    def INPUT_TYPES(cls):
        # The web extension replaces this custom input with a tree selector.
        # default remains a legacy folder string so old workflow JSON still loads.
        folders = lora_folder_options()
        return {
            "required": {
                "model": ("MODEL",),
                "folder": (
                    "LORA_SELECTION",
                    {
                        "default": folders[0] if folders else NO_FOLDER_OPTION,
                        "widgetType": "LORA_SELECTION",
                        "lora_files": list(folder_paths.get_filename_list("loras")),
                        "tooltip": "左键展开文件夹；右键选择文件夹或 LoRA。单条固定，多条随机。",
                    },
                ),
                "strength_model": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -100.0,
                        "max": 100.0,
                        "step": 0.01,
                        "tooltip": "LoRA 对 MODEL 的作用强度。0 时保留原模型，但仍输出本次选择名称。",
                    },
                ),
            }
        }

    @classmethod
    def VALIDATE_INPUTS(cls, folder, **_kwargs):
        try:
            resolve_candidates(folder)
            return True
        except ValueError as error:
            return str(error)

    @classmethod
    def IS_CHANGED(cls, model, folder, strength_model):
        try:
            candidates = resolve_candidates(folder)
        except ValueError:
            return float("nan")
        # A single candidate is intentionally identical to the native fixed LoRA
        # loader. Multi-selection must execute afresh to choose a new LoRA.
        if len(candidates) > 1:
            return float("nan")
        return ("fixed_lora", _canonical_filename(candidates[0]), float(strength_model))

    def _load_payload(self, selected_lora: str):
        lora_path = folder_paths.get_full_path_or_raise("loras", selected_lora)
        if self.loaded_lora is not None and self.loaded_lora[0] == lora_path:
            return self.loaded_lora[1], self.loaded_lora[2]

        lora, lora_metadata = comfy.utils.load_torch_file(
            lora_path,
            safe_load=True,
            return_metadata=True,
        )
        self.loaded_lora = (lora_path, lora, lora_metadata)
        return lora, lora_metadata

    def load_random_lora(self, model, folder: Any, strength_model: float):
        candidates = resolve_candidates(folder)
        selected_lora = candidates[0] if len(candidates) == 1 else random.choice(candidates)

        if strength_model == 0:
            return model, selected_lora

        lora, lora_metadata = self._load_payload(selected_lora)
        model_lora, _ = comfy.sd.load_lora_for_models(
            model,
            None,
            lora,
            strength_model,
            0,
            lora_metadata=lora_metadata,
        )
        return model_lora, selected_lora
