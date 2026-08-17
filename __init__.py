from .random_lora_model_only import RandomLoraLoaderModelOnly

# The experimental frontend selector is intentionally disabled until it can be
# restored without interfering with ComfyUI's native widget serialization.
NODE_CLASS_MAPPINGS = {
    "RandomLoraLoaderModelOnly": RandomLoraLoaderModelOnly,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RandomLoraLoaderModelOnly": "Krea2专用随机LoRA加载器",
}
