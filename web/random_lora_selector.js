import { app } from "../../../scripts/app.js";

const NODE_CLASS = "RandomLoraLoaderModelOnly";
const STYLE_ID = "krea2-random-lora-selector-style";

function canonicalPath(path) {
    return String(path || "").replaceAll("\\", "/").split("/").filter(Boolean).join("/");
}

function selectionFromValue(value, files) {
    if (value && typeof value === "object" && value.version === 1 && Array.isArray(value.selected)) {
        return {
            version: 1,
            selected: value.selected
                .filter(item => item && ["file", "folder"].includes(item.kind) && item.path)
                .map(item => ({ kind: item.kind, path: canonicalPath(item.path) })),
        };
    }
    const legacy = canonicalPath(value);
    return legacy
        ? { version: 1, selected: [{ kind: files.includes(legacy) ? "file" : "folder", path: legacy }] }
        : { version: 1, selected: [] };
}

function buildTree(files) {
    const root = { folders: new Map(), files: [] };
    for (const rawFile of files) {
        const file = canonicalPath(rawFile);
        const parts = file.split("/");
        let current = root;
        for (const folder of parts.slice(0, -1)) {
            if (!current.folders.has(folder)) current.folders.set(folder, { folders: new Map(), files: [] });
            current = current.folders.get(folder);
        }
        current.files.push({ name: parts.at(-1), path: file });
    }
    return root;
}

function descendantFiles(tree) {
    return [...tree.files.map(file => file.path), ...[...tree.folders.values()].flatMap(descendantFiles)];
}

function candidatePaths(config, files) {
    const result = new Set();
    for (const item of config.selected || []) {
        const path = canonicalPath(item.path);
        if (item.kind === "file" && files.includes(path)) result.add(path);
        if (item.kind === "folder") {
            const prefix = `${path}/`;
            files.filter(file => file.startsWith(prefix)).forEach(file => result.add(file));
        }
    }
    return result;
}

function folderState(config, path, descendants, files) {
    if (config.selected.some(item => item.kind === "folder" && item.path === path)) return "all";
    const selected = candidatePaths(config, files);
    const count = descendants.filter(file => selected.has(file)).length;
    return count === 0 ? "none" : count === descendants.length ? "all" : "partial";
}

function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
    return `${result}…`;
}

function getLocale() {
    const configured = app?.ui?.settings?.getSettingValue?.("Comfy.Locale") || "";
    return `${configured} ${document.documentElement.lang || ""} ${navigator.language || ""}`.toLowerCase();
}

function localizeOutputs(node) {
    const chinese = /(^|[-_\s])zh|zh-/.test(getLocale());
    if (node.outputs?.[0]) {
        node.outputs[0].name = "model";
        node.outputs[0].label = "model";
    }
    if (node.outputs?.[1]) {
        const label = chinese ? "预览输出LoRA" : "Preview LoRA";
        node.outputs[1].name = label;
        node.outputs[1].label = label;
    }
    const strength = node.widgets?.find(widget => widget.name === "strength_model");
    if (strength) {
        strength.label = chinese ? "模型强度" : "Model Strength";
    }
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .krea2-lora-popup { position: fixed; z-index: 10000; min-width: 300px; max-width: calc(100vw - 24px); overflow: hidden; color: #ddd; background: #222; border: 1px solid #777; border-radius: 7px; box-shadow: 0 12px 32px #000b; font: 12px sans-serif; }
      .krea2-lora-popup-header { padding: 8px 10px; background: #292929; border-bottom: 1px solid #ffffff20; font-weight: 600; }
      .krea2-lora-popup-tree { max-height: 320px; overflow: auto; padding: 6px; }
      .krea2-lora-summary { position: sticky; top: -6px; z-index: 1; padding: 5px 4px 7px; background: #222; color: #aaa; }
      .krea2-lora-row { display: flex; align-items: center; min-height: 24px; padding: 1px 4px; border-radius: 4px; user-select: none; }
      .krea2-lora-row:hover { background: #ffffff12; }
      .krea2-lora-row.folder { cursor: pointer; font-weight: 600; }
      .krea2-lora-row.selected { background: #238636; color: #fff; }
      .krea2-lora-row.partial { box-shadow: inset 3px 0 #3fb950; }
      .krea2-lora-arrow { width: 14px; text-align: center; color: #aaa; }
      .krea2-lora-status { width: 15px; height: 15px; margin-right: 6px; border: 1px solid #777; border-radius: 3px; box-sizing: border-box; }
      .krea2-lora-status.all { background: #238636; border-color: #3fb950; }
      .krea2-lora-status.all::after { content: "✓"; display: block; text-align: center; line-height: 13px; color: #fff; font-size: 11px; }
      .krea2-lora-status.partial { background: linear-gradient(90deg, #3fb950 50%, transparent 50%); border-color: #3fb950; }
      .krea2-lora-file-icon { width: 14px; margin-right: 6px; color: #aab7c4; }
      .krea2-lora-children { display: none; margin-left: 16px; border-left: 1px solid #ffffff18; }
      .krea2-lora-children.open { display: block; }
      .krea2-lora-empty { padding: 16px 4px; color: #888; }
    `;
    document.head.append(style);
}

function createNativeSelector(node, widget, files) {
    ensureStyles();
    const tree = buildTree(files);
    let config = selectionFromValue(widget.value, files);
    const expanded = new Set();
    let popup = null;
    let anchor = null;
    let outsideHandler = null;
    let escapeHandler = null;

    const summaryText = () => {
        const count = candidatePaths(config, files).size;
        return count === 1 ? "已选 1 条 LoRA（固定）" : `已选 ${count} 条 LoRA（每次 Queue 随机）`;
    };

    const persist = () => {
        // Standard STRING wire value avoids positional custom-widget corruption.
        widget.value = JSON.stringify(config);
        widget.callback?.(widget.value);
        node.setDirtyCanvas?.(true, true);
    };

    const closePopup = () => {
        popup?.remove();
        popup = null;
        if (outsideHandler) document.removeEventListener("pointerdown", outsideHandler, true);
        if (escapeHandler) document.removeEventListener("keydown", escapeHandler, true);
        window.removeEventListener("resize", positionPopup);
        window.removeEventListener("scroll", positionPopup, true);
        outsideHandler = null;
        escapeHandler = null;
    };

    const positionPopup = () => {
        if (!popup || !anchor) return;
        const width = Math.min(Math.max(anchor.width, 300), 420, window.innerWidth - 24);
        const maxHeight = Math.min(380, window.innerHeight - 24);
        popup.style.width = `${width}px`;
        popup.style.maxHeight = `${maxHeight}px`;
        popup.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
        const below = anchor.top + anchor.height + 6;
        const above = anchor.top - maxHeight - 6;
        popup.style.top = `${Math.max(12, below + maxHeight <= window.innerHeight - 12 ? below : above)}px`;
    };

    const toggle = (kind, path) => {
        const index = config.selected.findIndex(item => item.kind === kind && item.path === path);
        if (index >= 0) config.selected.splice(index, 1);
        else config.selected.push({ kind, path });
        persist();
        renderPopup();
    };

    const renderFolder = (name, subtree, path) => {
        const descendants = descendantFiles(subtree);
        const state = folderState(config, path, descendants, files);
        const row = document.createElement("div");
        row.className = `krea2-lora-row folder ${state}`;
        row.innerHTML = `<span class="krea2-lora-arrow">${expanded.has(path) ? "▾" : "▸"}</span>`;
        const status = document.createElement("span");
        status.className = `krea2-lora-status ${state}`;
        const label = document.createElement("span");
        label.textContent = `${name} (${descendants.length})`;
        row.append(status, label);
        row.onclick = () => {
            expanded.has(path) ? expanded.delete(path) : expanded.add(path);
            renderPopup();
        };
        row.oncontextmenu = event => {
            event.preventDefault();
            event.stopPropagation();
            toggle("folder", path);
        };

        const children = document.createElement("div");
        children.className = `krea2-lora-children ${expanded.has(path) ? "open" : ""}`;
        for (const [childName, childTree] of [...subtree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            children.append(renderFolder(childName, childTree, `${path}/${childName}`));
        }
        const selected = candidatePaths(config, files);
        for (const file of [...subtree.files].sort((a, b) => a.name.localeCompare(b.name))) {
            const fileRow = document.createElement("div");
            fileRow.className = `krea2-lora-row ${selected.has(file.path) ? "selected" : ""}`;
            fileRow.title = "右键：选择/取消此 LoRA";
            fileRow.textContent = `　•　${file.name}`;
            fileRow.oncontextmenu = event => {
                event.preventDefault();
                event.stopPropagation();
                toggle("file", file.path);
            };
            children.append(fileRow);
        }
        const fragment = document.createDocumentFragment();
        fragment.append(row, children);
        return fragment;
    };

    const renderPopup = () => {
        if (!popup) return;
        const content = popup.querySelector(".krea2-lora-popup-tree");
        content.replaceChildren();
        const summary = document.createElement("div");
        summary.className = "krea2-lora-summary";
        summary.textContent = summaryText();
        content.append(summary);
        if (!files.length) {
            const empty = document.createElement("div");
            empty.className = "krea2-lora-empty";
            empty.textContent = "没有可用的 LoRA 文件";
            content.append(empty);
            return;
        }
        for (const [name, subtree] of [...tree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            content.append(renderFolder(name, subtree, name));
        }
        if (tree.files.length) {
            const selected = candidatePaths(config, files);
            for (const file of [...tree.files].sort((a, b) => a.name.localeCompare(b.name))) {
                const row = document.createElement("div");
                row.className = `krea2-lora-row ${selected.has(file.path) ? "selected" : ""}`;
                row.textContent = `•　${file.name}`;
                row.oncontextmenu = event => {
                    event.preventDefault();
                    toggle("file", file.path);
                };
                content.append(row);
            }
        }
    };

    const openPopup = () => {
        if (popup) return closePopup();
        popup = document.createElement("div");
        popup.className = "krea2-lora-popup";
        const header = document.createElement("div");
        header.className = "krea2-lora-popup-header";
        header.textContent = "LoRA 选择器（左键展开，右键选择）";
        const content = document.createElement("div");
        content.className = "krea2-lora-popup-tree";
        popup.append(header, content);
        document.body.append(popup);
        renderPopup();
        positionPopup();
        outsideHandler = event => {
            if (!popup?.contains(event.target)) closePopup();
        };
        escapeHandler = event => event.key === "Escape" && closePopup();
        setTimeout(() => document.addEventListener("pointerdown", outsideHandler, true), 0);
        document.addEventListener("keydown", escapeHandler, true);
        window.addEventListener("resize", positionPopup);
        window.addEventListener("scroll", positionPopup, true);
    };

    widget.serializeValue = () => JSON.stringify(config);
    widget.computeSize = width => [width || 200, 28];
    widget.draw = function (ctx, drawNode, width, y, height) {
        // This is the original STRING widget row, not an appended DOM/custom row.
        // Clamp every draw operation to the current node width.
        const margin = 10;
        const availableWidth = Math.min(width || drawNode.size[0], drawNode.size[0]);
        const rowHeight = Math.min(height || 28, 28);
        const rowY = y + Math.max(0, ((height || rowHeight) - rowHeight) / 2);
        const rowWidth = Math.max(0, availableWidth - margin * 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, rowY, drawNode.size[0], rowHeight);
        ctx.clip();
        ctx.fillStyle = "#252525";
        ctx.strokeStyle = "#666";
        ctx.beginPath();
        ctx.roundRect(margin, rowY, rowWidth, rowHeight, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ddd";
        ctx.font = "12px sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(fitText(ctx, summaryText(), Math.max(0, rowWidth - 32)), margin + 9, rowY + rowHeight / 2);
        ctx.fillStyle = "#aaa";
        ctx.fillText("▾", margin + rowWidth - 16, rowY + rowHeight / 2);
        const canvasRect = ctx.canvas.getBoundingClientRect();
        const transform = ctx.getTransform();
        const scaleX = canvasRect.width / ctx.canvas.width;
        const scaleY = canvasRect.height / ctx.canvas.height;
        anchor = {
            left: canvasRect.left + (transform.e + margin * transform.a) * scaleX,
            top: canvasRect.top + (transform.f + rowY * transform.d) * scaleY,
            width: rowWidth * transform.a * scaleX,
            height: rowHeight * transform.d * scaleY,
        };
        if (popup) positionPopup();
        ctx.restore();
    };
    widget.mouse = function (event) {
        if (event.type === "pointerdown" && event.button === 0) {
            openPopup();
            return true;
        }
        return false;
    };
    widget.onRemove = closePopup;
    return widget;
}

app.registerExtension({
    name: "wyjzp.Krea2RandomLoraLoader.StableSelector",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            const spec = nodeData.input?.required?.folder?.[1] || {};
            const files = (spec.lora_files || []).map(canonicalPath).sort();
            const folderWidget = this.widgets?.find(widget => widget.name === "folder");
            if (folderWidget && !this.__krea2LoraSelectorMounted) {
                this.__krea2LoraSelectorMounted = true;
                createNativeSelector(this, folderWidget, files);
            }
            localizeOutputs(this);
            return result;
        };
    },
});
