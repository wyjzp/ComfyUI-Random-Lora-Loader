import { app } from "../../../scripts/app.js";

const NODE_CLASS = "RandomLoraLoaderModelOnly";
const PROPERTY_KEY = "krea2_lora_selection";
let knownLoraFiles = [];
const STYLE_ID = "krea2-lora-tree-popup-style";

function canonicalPath(value) {
    return String(value || "").replaceAll("\\", "/").split("/").filter(Boolean).join("/");
}

function isChineseLocale() {
    const configured = app?.ui?.settings?.getSettingValue?.("Comfy.Locale") || "";
    const locale = `${configured} ${document.documentElement.lang || ""} ${navigator.language || ""}`.toLowerCase();
    return /(^|[-_\s])zh|zh-/.test(locale);
}

function buildTree(files) {
    const root = { folders: new Map(), files: [] };
    for (const raw of files) {
        const path = canonicalPath(raw);
        const parts = path.split("/");
        let current = root;
        for (const name of parts.slice(0, -1)) {
            if (!current.folders.has(name)) current.folders.set(name, { folders: new Map(), files: [] });
            current = current.folders.get(name);
        }
        current.files.push({ name: parts.at(-1), path });
    }
    return root;
}

function descendantFiles(tree) {
    return [...tree.files.map(file => file.path), ...[...tree.folders.values()].flatMap(descendantFiles)];
}

function getConfig(node, fallbackFolder) {
    const value = node.properties?.[PROPERTY_KEY];
    if (value?.version === 1 && Array.isArray(value.selected)) {
        return {
            version: 1,
            selected: value.selected
                .filter(item => item && ["file", "folder"].includes(item.kind) && item.path)
                .map(item => ({ kind: item.kind, path: canonicalPath(item.path) })),
        };
    }
    return {
        version: 1,
        selected: fallbackFolder ? [{ kind: "folder", path: canonicalPath(fallbackFolder) }] : [],
    };
}

function saveConfig(node, config) {
    node.properties ||= {};
    node.properties[PROPERTY_KEY] = config;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function candidates(config, files) {
    const result = new Set();
    for (const item of config.selected) {
        if (item.kind === "file" && files.includes(item.path)) result.add(item.path);
        if (item.kind === "folder") {
            const prefix = `${item.path}/`;
            files.filter(file => file.startsWith(prefix)).forEach(file => result.add(file));
        }
    }
    return result;
}

function stateForFolder(config, folderPath, descendants, files) {
    if (config.selected.some(item => item.kind === "folder" && item.path === folderPath)) return "all";
    const selected = candidates(config, files);
    const selectedCount = descendants.filter(file => selected.has(file)).length;
    return selectedCount === 0 ? "none" : selectedCount === descendants.length ? "all" : "partial";
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .krea2-lora-popup { position: fixed; z-index: 10000; width: min(440px, calc(100vw - 24px)); max-height: min(520px, calc(100vh - 24px)); display: flex; flex-direction: column; overflow: hidden; color: #ddd; background: #222; border: 1px solid #777; border-radius: 7px; box-shadow: 0 12px 32px #000b; font: 13px sans-serif; }
      .krea2-lora-popup-header { display: flex; align-items: center; gap: 8px; padding: 9px 10px; background: #292929; border-bottom: 1px solid #ffffff20; font-weight: 600; }
      .krea2-lora-search { flex: 1; min-width: 0; padding: 6px 9px; color: #ddd; background: #171717; border: 1px solid #777; border-radius: 4px; }
      .krea2-lora-close { color: #ddd; background: transparent; border: 0; font-size: 18px; cursor: pointer; }
      .krea2-lora-popup-body { flex: 1; overflow: auto; padding: 7px; }
      .krea2-lora-summary { position: sticky; top: -7px; z-index: 1; padding: 5px 3px 8px; color: #aaa; background: #222; }
      .krea2-lora-row { display: flex; align-items: center; min-height: 25px; padding: 2px 5px; border-radius: 4px; user-select: none; }
      .krea2-lora-row:hover { background: #ffffff12; }
      .krea2-lora-folder { cursor: pointer; font-weight: 600; }
      .krea2-lora-row.selected { background: #238636; color: #fff; }
      .krea2-lora-row.partial { box-shadow: inset 3px 0 #3fb950; }
      .krea2-lora-arrow { width: 16px; color: #aaa; text-align: center; }
      .krea2-lora-status { width: 15px; height: 15px; margin-right: 7px; border: 1px solid #777; border-radius: 3px; box-sizing: border-box; }
      .krea2-lora-status.all { background: #238636; border-color: #3fb950; }
      .krea2-lora-status.all::after { content: "✓"; display: block; color: #fff; font-size: 11px; line-height: 13px; text-align: center; }
      .krea2-lora-status.partial { background: linear-gradient(90deg, #3fb950 50%, transparent 50%); border-color: #3fb950; }
      .krea2-lora-child { display: none; margin-left: 17px; border-left: 1px solid #ffffff18; }
      .krea2-lora-child.open { display: block; }
      .krea2-lora-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .krea2-lora-empty { padding: 30px 0; color: #888; text-align: center; }
    `;
    document.head.append(style);
}

function localizeNode(node) {
    const chinese = isChineseLocale();
    const folder = node.widgets?.find(widget => widget.name === "folder");
    const strength = node.widgets?.find(widget => widget.name === "strength_model");
    if (folder) folder.label = chinese ? "LoRA选择" : "LoRA Selection";
    if (strength) strength.label = chinese ? "模型强度" : "Model Strength";
    if (node.outputs?.[0]) {
        node.outputs[0].name = "model";
        node.outputs[0].label = "model";
    }
    if (node.outputs?.[1]) {
        const label = chinese ? "预览输出LoRA" : "Preview LoRA";
        node.outputs[1].name = label;
        node.outputs[1].label = label;
    }
}

function openTreePopup(node, folderWidget, files, event) {
    ensureStyles();
    document.querySelectorAll(".krea2-lora-popup").forEach(item => item.remove());
    const tree = buildTree(files);
    let config = getConfig(node, folderWidget.value);
    const expanded = new Set();
    const popup = document.createElement("div");
    popup.className = "krea2-lora-popup";

    const close = () => {
        popup.remove();
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("keydown", escape, true);
    };
    const outside = click => {
        if (!popup.contains(click.target)) close();
    };
    const escape = key => {
        if (key.key === "Escape") close();
    };

    const header = document.createElement("div");
    header.className = "krea2-lora-popup-header";
    const title = document.createElement("span");
    title.textContent = isChineseLocale() ? "LoRA 选择（左键展开，右键选择）" : "LoRA Selection (left: expand, right: select)";
    const search = document.createElement("input");
    search.className = "krea2-lora-search";
    search.placeholder = isChineseLocale() ? "搜索 LoRA…" : "Search LoRAs…";
    const closeButton = document.createElement("button");
    closeButton.className = "krea2-lora-close";
    closeButton.textContent = "×";
    closeButton.onclick = close;
    header.append(title, search, closeButton);

    const body = document.createElement("div");
    body.className = "krea2-lora-popup-body";

    const persist = () => {
        saveConfig(node, config);
        const count = candidates(config, files).size;
        folderWidget.label = isChineseLocale()
            ? `LoRA选择（${count}）`
            : `LoRA Selection (${count})`;
    };
    const toggle = (kind, path) => {
        const index = config.selected.findIndex(item => item.kind === kind && item.path === path);
        if (index >= 0) config.selected.splice(index, 1);
        else config.selected.push({ kind, path });
        persist();
        render();
    };

    const renderFolder = (name, subtree, path, query) => {
        const descendants = descendantFiles(subtree);
        const includesQuery = !query || descendants.some(file => file.toLowerCase().includes(query));
        if (!includesQuery && !name.toLowerCase().includes(query)) return null;
        const state = stateForFolder(config, path, descendants, files);
        const row = document.createElement("div");
        row.className = `krea2-lora-row krea2-lora-folder ${state === "all" ? "selected" : state === "partial" ? "partial" : ""}`;
        const arrow = document.createElement("span");
        arrow.className = "krea2-lora-arrow";
        arrow.textContent = expanded.has(path) || query ? "▾" : "▸";
        const status = document.createElement("span");
        status.className = `krea2-lora-status ${state}`;
        const label = document.createElement("span");
        label.textContent = `${name} (${descendants.length})`;
        row.append(arrow, status, label);
        row.onclick = () => {
            expanded.has(path) ? expanded.delete(path) : expanded.add(path);
            render();
        };
        row.oncontextmenu = rightClick => {
            rightClick.preventDefault();
            rightClick.stopPropagation();
            toggle("folder", path);
        };

        const children = document.createElement("div");
        children.className = `krea2-lora-child ${expanded.has(path) || query ? "open" : ""}`;
        for (const [childName, childTree] of [...subtree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const child = renderFolder(childName, childTree, `${path}/${childName}`, query);
            if (child) children.append(child);
        }
        const selected = candidates(config, files);
        for (const file of [...subtree.files].sort((a, b) => a.name.localeCompare(b.name))) {
            if (query && !file.path.toLowerCase().includes(query)) continue;
            const fileRow = document.createElement("div");
            fileRow.className = `krea2-lora-row ${selected.has(file.path) ? "selected" : ""}`;
            const spacer = document.createElement("span");
            spacer.className = "krea2-lora-arrow";
            const dot = document.createElement("span");
            dot.textContent = "•";
            dot.style.marginRight = "8px";
            const label = document.createElement("span");
            label.className = "krea2-lora-path";
            label.textContent = file.name;
            fileRow.title = file.path;
            fileRow.append(spacer, dot, label);
            fileRow.oncontextmenu = rightClick => {
                rightClick.preventDefault();
                rightClick.stopPropagation();
                toggle("file", file.path);
            };
            children.append(fileRow);
        }
        const result = document.createDocumentFragment();
        result.append(row, children);
        return result;
    };

    const render = () => {
        body.replaceChildren();
        const summary = document.createElement("div");
        summary.className = "krea2-lora-summary";
        const count = candidates(config, files).size;
        summary.textContent = count === 1
            ? (isChineseLocale() ? "已选 1 条 LoRA：固定加载" : "1 selected LoRA: fixed loading")
            : (isChineseLocale() ? `已选 ${count} 条 LoRA：每次 Queue 随机` : `${count} selected LoRAs: random each Queue`);
        body.append(summary);
        const query = search.value.trim().toLowerCase();
        for (const [name, subtree] of [...tree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const item = renderFolder(name, subtree, name, query);
            if (item) body.append(item);
        }
        if (!body.children.length || (body.children.length === 1 && query)) {
            const empty = document.createElement("div");
            empty.className = "krea2-lora-empty";
            empty.textContent = isChineseLocale() ? "没有匹配的 LoRA" : "No matching LoRAs";
            body.append(empty);
        }
    };

    search.oninput = render;
    popup.append(header, body);
    document.body.append(popup);
    const left = Math.max(12, Math.min(event?.clientX || 24, window.innerWidth - 452));
    const top = Math.max(12, Math.min((event?.clientY || 24) + 6, window.innerHeight - 532));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    render();
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    document.addEventListener("keydown", escape, true);
}

function bindRandomLoraNode(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (node.__krea2LoraPopupBound) return;
    const inputSpec = node.constructor?.nodeData?.input?.required?.folder?.[1]
        || node.constructor?.nodeData?.required?.folder?.[1]
        || node._nodeData?.input?.required?.folder?.[1]
        || {};
    const files = [...new Set([
        ...(inputSpec.lora_files || []),
        ...knownLoraFiles,
    ].map(canonicalPath))].sort();
    const folderWidget = node.widgets?.find(widget => widget.name === "folder");
    if (!folderWidget) return;
    node.__krea2LoraPopupBound = true;
    const originalMouse = folderWidget.mouse;
    folderWidget.mouse = (event, pos, targetNode) => {
        if (event.type === "pointerdown" && event.button === 0) {
            openTreePopup(targetNode, folderWidget, files, event);
            return true;
        }
        return originalMouse?.(event, pos, targetNode) || false;
    };
    const count = candidates(getConfig(node, folderWidget.value), files).size;
    folderWidget.label = isChineseLocale() ? `LoRA选择（${count}）` : `LoRA Selection (${count})`;
    localizeNode(node);
}

app.registerExtension({
    name: "wyjzp.Krea2RandomLoraLoader.PropertySelection",
    nodeCreated(node) {
        bindRandomLoraNode(node);
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const inputSpec = nodeData.input?.required?.folder?.[1]
            || nodeData.required?.folder?.[1]
            || {};
        knownLoraFiles = [...new Set([
            ...(inputSpec.lora_files || []),
            ...knownLoraFiles,
        ].map(canonicalPath))];
        nodeType.nodeData = nodeData;
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            bindRandomLoraNode(this);
            return result;
        };
    },
});
