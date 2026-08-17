# Krea2專用隨機 LoRA 載入器

[简体中文](README.md) | 繁體中文 | [English](README.en.md)

這是一個專為 **Krea2** 設計的 ComfyUI 自訂節點，使用 ComfyUI 原生下拉選單選擇 LoRA 資料夾或單一 LoRA 檔案。

Krea2 LoRA 不需要提示詞觸發詞，因此適合每次執行隨機載入。本插件不讀取、管理或自動加入觸發詞，不建議用於依賴觸發詞的其他模型 LoRA。

## 使用方式

搜尋並加入節點：

```text
Krea2專用隨機LoRA加载器
```

輸入：

- `model`：接入模型載入器輸出的 MODEL；
- `選擇 LoRA`：使用 ComfyUI 原生搜尋下拉選單選擇資料夾或單一 LoRA；
- `模型強度`：LoRA 作用強度，預設為 `1.0`。

選擇資料夾時，會遞迴包含該資料夾及子資料夾中的所有 LoRA，每次 Queue 隨機載入一條。選擇單一 LoRA 檔案時，固定載入該檔案。

## 輸出

- `model`：套用 LoRA 後的模型；
- `selected_lora`：本次實際載入的 LoRA 相對路徑，可連接 Show Text 查看。

範例：

```text
人物/XXX.safetensors
```

## 注意

- 只修改 MODEL，不修改 CLIP；
- 不提供觸發詞自動填入；
- 每次獨立 Queue 執行會重新隨機；
- 使用 ComfyUI 設定的原生 `loras` 模型路徑；
- 不修改 ComfyUI 核心檔案。
