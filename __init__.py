from .krea2_random_lora_loader import Krea2RandomLoraLoader
from .random_lora_model_only import RandomLoraLoaderModelOnly

# Keep this node on ComfyUI native combo widgets. The experimental tree UI is
# intentionally disabled so selection can never fall back to a Value/OK editor.

NODE_CLASS_MAPPINGS = {
    "Krea2RandomLoraLoader": Krea2RandomLoraLoader,
    # Compatibility mapping for old workflows. New nodes use Krea2RandomLoraLoader.
    "RandomLoraLoaderModelOnly": RandomLoraLoaderModelOnly,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Krea2RandomLoraLoader": "Krea2专用随机LoRA加载器",
    "RandomLoraLoaderModelOnly": "（旧）随机LoRA加载器",
}
