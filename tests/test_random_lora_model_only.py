from __future__ import annotations

import importlib.util
import math
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PLUGIN_ROOT / "random_lora_model_only.py"


def load_module(filenames=()):
    folder_paths = types.ModuleType("folder_paths")
    folder_paths.get_filename_list = Mock(return_value=list(filenames))
    folder_paths.get_full_path_or_raise = Mock(
        side_effect=lambda _, name: f"/loras/{name}"
    )

    comfy = types.ModuleType("comfy")
    comfy_sd = types.ModuleType("comfy.sd")
    comfy_utils = types.ModuleType("comfy.utils")
    comfy.sd = comfy_sd
    comfy.utils = comfy_utils
    comfy_utils.load_torch_file = Mock(return_value=({"payload": 1}, {"meta": 1}))
    comfy_sd.load_lora_for_models = Mock(return_value=("patched-model", None))

    module_names = ("folder_paths", "comfy", "comfy.sd", "comfy.utils")
    old_modules = {name: sys.modules.get(name) for name in module_names}
    sys.modules.update({
        "folder_paths": folder_paths,
        "comfy": comfy,
        "comfy.sd": comfy_sd,
        "comfy.utils": comfy_utils,
    })
    try:
        spec = importlib.util.spec_from_file_location(
            "random_lora_model_only_test", MODULE_PATH
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module, folder_paths, comfy
    finally:
        for name, previous in old_modules.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous


FILES = [
    "人物/A.safetensors",
    "人物/写实/B.safetensors",
    "人物/写实/C.safetensors",
    "风格/D.safetensors",
    "root.safetensors",
]


def config(*entries):
    return {"version": 1, "selected": list(entries)}


def folder(path):
    return {"kind": "folder", "path": path}


def file(path):
    return {"kind": "file", "path": path}


class RandomLoraLoaderTests(unittest.TestCase):
    def setUp(self):
        self.module, self.folder_paths, self.comfy = load_module(FILES)

    def test_folder_options_include_nested_subfolders(self):
        self.assertEqual(
            self.module.lora_folder_options(FILES),
            ["人物", "人物/写实", "风格"],
        )

    def test_legacy_folder_recursively_includes_child_loras(self):
        self.assertEqual(
            self.module.resolve_candidates("人物", FILES),
            ["人物/A.safetensors", "人物/写实/B.safetensors", "人物/写实/C.safetensors"],
        )
        self.assertEqual(
            self.module.resolve_candidates("人物/写实", FILES),
            ["人物/写实/B.safetensors", "人物/写实/C.safetensors"],
        )

    def test_exact_file_selection_is_fixed(self):
        selection = config(file("人物/写实/B.safetensors"))
        self.assertEqual(
            self.module.resolve_candidates(selection, FILES),
            ["人物/写实/B.safetensors"],
        )
        node = self.module.RandomLoraLoaderModelOnly()
        with patch.object(self.module.random, "choice") as choice:
            _, selected = node.load_random_lora("model", selection, 1)
        self.assertEqual(selected, "人物/写实/B.safetensors")
        choice.assert_not_called()

    def test_mixed_folder_and_file_selection_is_recursive_and_deduplicated(self):
        selection = config(folder("人物"), file("人物/A.safetensors"), folder("风格"))
        self.assertEqual(
            self.module.resolve_candidates(selection, FILES),
            [
                "人物/A.safetensors",
                "人物/写实/B.safetensors",
                "人物/写实/C.safetensors",
                "风格/D.safetensors",
            ],
        )

    def test_wrapped_selection_is_accepted(self):
        selection = {"__value__": config(file("人物/A.safetensors"))}
        self.assertEqual(
            self.module.resolve_candidates(selection, FILES),
            ["人物/A.safetensors"],
        )

    def test_json_string_selection_is_accepted(self):
        import json

        selection = json.dumps(config(file("人物/A.safetensors")), ensure_ascii=False)
        self.assertEqual(
            self.module.resolve_candidates(selection, FILES),
            ["人物/A.safetensors"],
        )

    def test_invalid_json_string_is_rejected(self):
        with self.assertRaises(ValueError):
            self.module.resolve_candidates('{"version":', FILES)

    def test_invalid_paths_and_stale_entries_are_rejected(self):
        invalid = [
            "",
            "..",
            "../checkpoints",
            "C:/loras/A.safetensors",
            "\\\\server\\share\\A.safetensors",
            config(file("人物/不存在.safetensors")),
            config(folder("不存在")),
            {"version": 99, "selected": [file("人物/A.safetensors")]},
            {"version": 1, "selected": [{"kind": "unknown", "path": "人物"}]},
        ]
        for selection in invalid:
            with self.subTest(selection=selection):
                with self.assertRaises(ValueError):
                    self.module.resolve_candidates(selection, FILES)

    def test_strength_zero_selects_without_loading(self):
        node = self.module.RandomLoraLoaderModelOnly()
        selection = config(folder("人物"))
        with patch.object(self.module.random, "choice", return_value="人物/A.safetensors"):
            model, selected = node.load_random_lora("original-model", selection, 0)
        self.assertEqual(model, "original-model")
        self.assertEqual(selected, "人物/A.safetensors")
        self.comfy.utils.load_torch_file.assert_not_called()
        self.comfy.sd.load_lora_for_models.assert_not_called()

    def test_multi_selection_random_name_matches_loaded_payload(self):
        node = self.module.RandomLoraLoaderModelOnly()
        selection = config(file("人物/A.safetensors"), file("人物/写实/B.safetensors"))
        with patch.object(
            self.module.random, "choice", return_value="人物/写实/B.safetensors"
        ):
            model, selected = node.load_random_lora("base-model", selection, 1.25)
        self.assertEqual(model, "patched-model")
        self.assertEqual(selected, "人物/写实/B.safetensors")
        self.folder_paths.get_full_path_or_raise.assert_called_once_with("loras", selected)
        self.comfy.sd.load_lora_for_models.assert_called_once_with(
            "base-model", None, {"payload": 1}, 1.25, 0, lora_metadata={"meta": 1}
        )

    def test_native_style_one_entry_payload_cache(self):
        node = self.module.RandomLoraLoaderModelOnly()
        selection_a = config(file("人物/A.safetensors"))
        selection_b = config(file("人物/写实/B.safetensors"))
        node.load_random_lora("model", selection_a, 1)
        node.load_random_lora("model", selection_a, 1)
        self.assertEqual(self.comfy.utils.load_torch_file.call_count, 1)
        node.load_random_lora("model", selection_b, 1)
        self.assertEqual(self.comfy.utils.load_torch_file.call_count, 2)

    def test_fixed_selection_has_stable_fingerprint(self):
        selection = config(file("人物/A.safetensors"))
        first = self.module.RandomLoraLoaderModelOnly.IS_CHANGED("model", selection, 1)
        second = self.module.RandomLoraLoaderModelOnly.IS_CHANGED("model", selection, 1)
        self.assertEqual(first, second)
        self.assertEqual(first[0], "fixed_lora")

    def test_multi_selection_has_non_cacheable_fingerprint(self):
        selection = config(file("人物/A.safetensors"), file("人物/写实/B.safetensors"))
        first = self.module.RandomLoraLoaderModelOnly.IS_CHANGED("model", selection, 1)
        second = self.module.RandomLoraLoaderModelOnly.IS_CHANGED("model", selection, 1)
        self.assertTrue(math.isnan(first))
        self.assertTrue(math.isnan(second))
        self.assertNotEqual(first, second)

    def test_validate_inputs_returns_error_for_bad_selection(self):
        self.assertTrue(
            self.module.RandomLoraLoaderModelOnly.VALIDATE_INPUTS(
                config(file("人物/A.safetensors"))
            )
        )
        error = self.module.RandomLoraLoaderModelOnly.VALIDATE_INPUTS(
            config(file("人物/不存在.safetensors"))
        )
        self.assertIsInstance(error, str)
        self.assertIn("不存在", error)

    def test_workflow_properties_override_legacy_folder(self):
        metadata = {
            "workflow": {
                "nodes": [{
                    "id": 165,
                    "properties": {
                        self.module.SELECTION_PROPERTY_KEY: config(
                            file("人物/写实/B.safetensors")
                        )
                    },
                }]
            }
        }
        selected = self.module.selection_from_workflow_properties([165], metadata)
        self.assertEqual(
            self.module.resolve_candidates(selected, FILES),
            ["人物/写实/B.safetensors"],
        )

    def test_missing_workflow_properties_use_legacy_folder(self):
        self.assertIsNone(
            self.module.selection_from_workflow_properties(165, {})
        )


if __name__ == "__main__":
    unittest.main()
