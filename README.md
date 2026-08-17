# Krea2专用随机LoRA加载器

一个仅面向 **Krea2** 的 ComfyUI 自定义节点，使用 ComfyUI 原生下拉列表选择 LoRA 文件夹或单个 LoRA 文件。Krea2 LoRA 不需要提示词触发词，因此很适合运行时随机加载。

## 节点

```text
Krea2专用随机LoRA加载器
```

节点只修改 `model`，不会修改 CLIP。

> **适用范围：** 本插件不读取、管理或自动追加 LoRA 触发词。请仅用于不依赖触发词的 Krea2 LoRA；不建议用于需要触发词才能生效的其他模型 LoRA。

## LoRA 下拉列表

`选择 LoRA` 下拉列表会同时显示文件夹和 LoRA 文件：

- 选择文件夹：递归包含该文件夹及子文件夹中的 LoRA，并随机加载；
- 选择单个 LoRA 文件：固定加载这一条，行为等同原生 LoRA 加载器；
- 列表支持 ComfyUI 原生搜索过滤。

## 输入

- `model`：接入模型加载器输出的 MODEL。
- `folder`：LoRA 树选择器。
  - 最终候选池只有一条 LoRA 时，它会固定加载该条，行为等同原生 LoRA 加载器。
  - 最终候选池有多条 LoRA 时，每次 Queue 从中随机选择一条。
- `strength_model`：LoRA 作用强度，默认 `1.0`。

## 输出

- `model`：加载本次 LoRA 后的模型。
- 中文界面：`预览输出LoRA`；英文界面：`Preview LoRA`。
  - 输出值始终为实际加载的 LoRA 相对路径，例如：

    ```text
    人物/XXX.safetensors
    ```

  - 可连接到 Show Text，记录每一张图实际使用的 LoRA。

## Queue 行为

- 选择一条 LoRA：每次都固定加载这条 LoRA。
- 选择多个 LoRA，或选择一个/多个文件夹：每个 Queue 条目都会重新随机一条。
- Queue 10 次时，多选范围会随机 10 次；同一次图执行中的下游节点共享本次选中的同一条 LoRA。
- 不提供随机种子或锁定功能。

## 说明

- 文件树与加载均使用 ComfyUI 原生 `loras` 模型目录接口，因此兼容 ComfyUI 已配置的额外 LoRA 路径。
- 仅接受 ComfyUI 当前枚举到的 LoRA 文件夹和文件，拒绝绝对路径、路径跳转和失效条目。
- `strength_model = 0` 时仍会选择并输出 LoRA 名称，但不读取文件、不修改模型。
- 节点保留最近一次已读取 LoRA 的内存缓存，与 ComfyUI 原生 LoRA 加载器的缓存行为一致。
