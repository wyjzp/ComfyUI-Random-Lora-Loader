# Krea2专用随机LoRA加载器

一个仅面向 **Krea2** 的 ComfyUI 自定义节点，使用原生下拉列表选择 LoRA 文件夹或单个 LoRA 文件。

Krea2 LoRA 不需要提示词触发词，因此适合每次运行随机加载；本插件不读取、管理或自动添加触发词，不建议用于依赖触发词的其他模型 LoRA。

## 使用方式

搜索并添加节点：

```text
Krea2专用随机LoRA加载器
```

输入：

- `model`：接入模型加载器输出的 MODEL；
- `选择 LoRA`：使用 ComfyUI 原生搜索下拉列表选择文件夹或 LoRA 文件；
- `模型强度`：LoRA 作用强度，默认 `1.0`。

选择文件夹时，会递归包含该文件夹及子文件夹中的所有 LoRA，每次 Queue 随机加载一条。选择单个 LoRA 文件时，固定加载该文件，行为接近原生 LoRA 加载器。

输出：

- `model`：应用 LoRA 后的模型；
- `selected_lora`：本次实际加载的 LoRA 相对路径，可连接 Show Text 查看。

示例输出：

```text
人物/XXX.safetensors
```

## 注意

- 只修改 MODEL，不修改 CLIP；
- 不提供触发词自动填充；
- 每次独立 Queue 执行会重新随机；
- 使用 ComfyUI 配置的原生 `loras` 模型目录；
- 不修改 ComfyUI 核心文件。
