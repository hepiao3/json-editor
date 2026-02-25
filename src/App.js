import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
// ── Icons ──────────────────────────────────────────────────────────────────
function IconExpandAll() {
    // 两个 chevron 向外张开，表示展开
    return (_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M3 6L8 1L13 6" }), _jsx("path", { d: "M3 10L8 15L13 10" }), _jsx("path", { d: "M4 8H12" })] }));
}
function IconCollapseAll() {
    // 两个 chevron 向内收拢，表示收起
    return (_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M3 1L8 6L13 1" }), _jsx("path", { d: "M3 15L8 10L13 15" }), _jsx("path", { d: "M4 8H12" })] }));
}
function IconCopy() {
    return (_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "5", y: "5", width: "8", height: "9", rx: "1.2" }), _jsx("path", { d: "M3 11H2.8A1.8 1.8 0 0 1 1 9.2V2.8A1.8 1.8 0 0 1 2.8 1H9.2A1.8 1.8 0 0 1 11 2.8V3" })] }));
}
function IconCopied() {
    return (_jsx("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "3 8 6.5 12 13 4" }) }));
}
// ── Tree helpers ───────────────────────────────────────────────────────────
function JsonValue({ value }) {
    if (value === null)
        return _jsx("span", { className: "null", children: "null" });
    if (typeof value === "boolean")
        return _jsx("span", { className: "bool", children: String(value) });
    if (typeof value === "number")
        return _jsx("span", { className: "num", children: value });
    if (typeof value === "string")
        return _jsxs("span", { className: "str", children: ["\"", value, "\""] });
    return null;
}
function TreeNodeRow({ keyName, value, depth, collapseKey = 0, expandAllKey = 0, }) {
    const [open, setOpen] = useState(true);
    const isObj = typeof value === "object" && value !== null;
    useEffect(() => {
        if (collapseKey > 0 && depth > 0)
            setOpen(false);
    }, [collapseKey, depth]);
    useEffect(() => {
        if (expandAllKey > 0)
            setOpen(true);
    }, [expandAllKey]);
    const indent = depth * 20;
    if (!isObj) {
        return (_jsxs("div", { className: "tree-row", style: { paddingLeft: indent + 4 }, children: [keyName !== null && _jsxs(_Fragment, { children: [_jsxs("span", { className: "tree-key", children: ["\"", keyName, "\""] }), _jsx("span", { className: "colon", children: ": " })] }), _jsx(JsonValue, { value: value })] }));
    }
    const isArr = Array.isArray(value);
    const entries = isArr
        ? value.map((v, i) => [String(i), v])
        : Object.entries(value);
    const [open_, close_] = isArr ? ["[", "]"] : ["{", "}"];
    return (_jsxs("div", { children: [_jsxs("div", { className: "tree-row", style: { paddingLeft: indent }, children: [_jsx("button", { className: `expand-btn ${open ? "open" : ""}`, onClick: () => setOpen(!open), children: "\u25B6" }), keyName !== null && _jsxs(_Fragment, { children: [_jsxs("span", { className: "tree-key", children: ["\"", keyName, "\""] }), _jsx("span", { className: "colon", children: ": " })] }), _jsx("span", { className: "bracket", children: open_ }), !open && _jsxs("span", { className: "hint", children: [entries.length, " ", isArr ? "items" : "keys"] }), !open && _jsx("span", { className: "bracket", children: close_ })] }), _jsxs("div", { style: { display: open ? undefined : "none" }, children: [entries.map(([k, v]) => (_jsx(TreeNodeRow, { keyName: isArr ? null : k, value: v, depth: depth + 1, collapseKey: collapseKey, expandAllKey: expandAllKey }, k))), _jsx("div", { className: "tree-row", style: { paddingLeft: indent }, children: _jsx("span", { className: "bracket", children: close_ }) })] })] }));
}
// ── AI helpers ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a JSON repair assistant. Given broken JSON, respond ONLY with a JSON object (no markdown):
{"success": true, "result": "...repaired json as escaped string..."}
OR
{"success": false, "reason": "...中文失败原因，最多80字..."}
Common fixable: trailing commas, single quotes, unquoted keys, missing commas, JS comments.
Return success=false only when structure is ambiguous or semantically broken.`;
function parseAiResponse(raw) {
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    try {
        return JSON.parse(text);
    }
    catch {
        const match = text.match(/\{[\s\S]*}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            }
            catch { /* fall through */ }
        }
    }
    return { success: false, reason: "AI 返回格式异常，无法解析" };
}
const PROVIDERS = [
    { id: "claude", name: "Claude (claude-3-5-haiku)", storageKey: "claude_api_key", placeholder: "sk-ant-..." },
    { id: "deepseek", name: "DeepSeek (deepseek-chat)", storageKey: "deepseek_api_key", placeholder: "sk-..." },
];
// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
    const [input, setInput] = useState("");
    const [status, setStatus] = useState("idle");
    const [error, setError] = useState("");
    const [parsed, setParsed] = useState(null);
    const [copiedInput, setCopiedInput] = useState(false);
    const [copiedOutput, setCopiedOutput] = useState(false);
    const [collapseKey, setCollapseKey] = useState(0);
    const [expandAllKey, setExpandAllKey] = useState(0);
    const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "dark");
    const [aiStatus, setAiStatus] = useState("idle");
    const [aiMessage, setAiMessage] = useState("");
    const [showSettings, setShowSettings] = useState(false);
    const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("ai_provider") ?? PROVIDERS[0].id);
    const [apiKeys, setApiKeys] = useState(() => {
        const saved = {};
        for (const p of PROVIDERS)
            saved[p.id] = localStorage.getItem(p.storageKey) ?? "";
        return saved;
    });
    const [providerDraft, setProviderDraft] = useState(PROVIDERS[0].id);
    const [apiKeyDraft, setApiKeyDraft] = useState("");
    const [viewMode, setViewMode] = useState("editor");
    const activeApiKey = apiKeys[aiProvider] ?? "";
    const editorRef = useRef(null);
    const inputRef = useRef(input);
    useEffect(() => { inputRef.current = input; }, [input]);
    const titleBarRef = useRef(null);
    useEffect(() => {
        const el = titleBarRef.current;
        if (!el)
            return;
        const onMouseDown = (e) => {
            if (e.button !== 0)
                return;
            e.preventDefault();
            getCurrentWindow().startDragging().catch(() => { });
        };
        el.addEventListener("mousedown", onMouseDown);
        return () => el.removeEventListener("mousedown", onMouseDown);
    }, []);
    useEffect(() => {
        let unlisten;
        getCurrentWindow()
            .onFocusChanged(({ payload: focused }) => {
            if (!focused)
                return;
            const editor = editorRef.current;
            if (!editor || inputRef.current)
                return; // 编辑器未就绪或已有内容，跳过
            readText()
                .then((clipText) => {
                if (clipText && clipText.trim()) {
                    let textToSet = clipText;
                    try {
                        const parsed = JSON.parse(clipText);
                        textToSet = JSON.stringify(parsed, null, 2);
                    }
                    catch {
                        // 非合法 JSON，保持原文
                    }
                    editor.setValue(textToSet);
                    setInput(textToSet);
                }
            })
                .catch(() => { });
        })
            .then((fn) => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);
    const handleEditorMount = async (editor) => {
        editorRef.current = editor;
        if (!input) {
            try {
                const clipText = await readText();
                if (clipText && clipText.trim()) {
                    let textToSet = clipText;
                    try {
                        const parsed = JSON.parse(clipText);
                        textToSet = JSON.stringify(parsed, null, 2);
                    }
                    catch {
                        // 非合法 JSON，保持原文
                    }
                    editor.setValue(textToSet);
                    setInput(textToSet);
                }
            }
            catch {
                // 剪贴板为空或无权限时，静默忽略
            }
        }
    };
    const handleChange = useCallback((val) => {
        const v = val ?? "";
        setInput(v);
        setAiStatus("idle");
        if (!v.trim()) {
            setStatus("idle");
            setError("");
            setParsed(null);
            return;
        }
        try {
            const data = JSON.parse(v);
            setStatus("ok");
            setError("");
            setParsed(data);
        }
        catch (e) {
            setStatus("error");
            setError(e.message);
            setParsed(null);
        }
    }, []);
    async function copyInput() {
        await writeText(input);
        setCopiedInput(true);
    }
    async function copyOutput() {
        if (!parsed)
            return;
        await writeText(JSON.stringify(parsed, null, 2));
        setCopiedOutput(true);
    }
    function loadSample() {
        const sample = {
            id: "proj-20240101",
            name: "json-editor",
            version: "2.1.0",
            published: true,
            license: null,
            repository: {
                type: "git",
                url: "https://github.com/example/json-editor",
                branches: {
                    main: { protected: true, rules: ["require-pr", "require-review"] },
                    dev: { protected: false, rules: [] },
                },
            },
            author: {
                name: "Claude",
                email: "hello@anthropic.com",
                social: {
                    github: "claude-dev",
                    twitter: null,
                    links: ["https://anthropic.com", "https://claude.ai"],
                },
            },
            contributors: [
                { name: "Alice", role: "frontend", commits: 142, active: true },
                { name: "Bob", role: "backend", commits: 87, active: false },
            ],
            config: {
                theme: "dark",
                editor: {
                    fontSize: 14,
                    tabSize: 2,
                    wordWrap: true,
                    minimap: { enabled: false },
                    keybindings: { format: "Shift+Alt+F", save: "Ctrl+S" },
                },
                performance: {
                    maxFileSize: 10485760,
                    lazyRender: true,
                    virtualScroll: { enabled: true, itemHeight: 24 },
                },
            },
            features: {
                core: ["格式化", "压缩", "树形预览", "文本预览"],
                experimental: {
                    enabled: true,
                    list: [
                        { name: "schema-validate", stable: false, since: "2.0.0" },
                        { name: "diff-view", stable: false, since: "2.1.0" },
                    ],
                },
            },
            stats: {
                stars: 2048,
                forks: 316,
                score: 9.8,
                downloads: { total: 184200, monthly: 12400, weekly: 3100 },
                issues: { open: 12, closed: 238, labels: { bug: 4, enhancement: 7, docs: 1 } },
            },
            changelog: [
                { version: "2.1.0", date: "2024-11-01", breaking: false, changes: ["新增逐层展开", "修复闪烁问题"] },
                { version: "2.0.0", date: "2024-09-15", breaking: true, changes: ["重构树形组件", "新增主题切换"] },
            ],
        };
        editorRef.current?.setValue(JSON.stringify(sample, null, 2));
    }
    function openSettings() {
        setProviderDraft(aiProvider);
        setApiKeyDraft(apiKeys[aiProvider] ?? "");
        setShowSettings(true);
    }
    function saveSettings() {
        const p = PROVIDERS.find(x => x.id === providerDraft);
        localStorage.setItem(p.storageKey, apiKeyDraft);
        localStorage.setItem("ai_provider", providerDraft);
        setApiKeys(prev => ({ ...prev, [providerDraft]: apiKeyDraft }));
        setAiProvider(providerDraft);
        setShowSettings(false);
    }
    async function repairWithAI() {
        if (!activeApiKey) {
            openSettings();
            return;
        }
        setAiStatus("loading");
        const inputText = input.length > 8000 ? input.slice(0, 8000) : input;
        try {
            let rawText = "";
            if (aiProvider === "claude") {
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": activeApiKey,
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                        model: "claude-3-5-haiku-20241022",
                        max_tokens: 4096,
                        system: SYSTEM_PROMPT,
                        messages: [{ role: "user", content: inputText }],
                    }),
                });
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                rawText = data.content?.[0]?.text ?? "";
            }
            else if (aiProvider === "deepseek") {
                const response = await fetch("https://api.deepseek.com/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${activeApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat",
                        max_tokens: 4096,
                        messages: [
                            { role: "system", content: SYSTEM_PROMPT },
                            { role: "user", content: inputText },
                        ],
                    }),
                });
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                rawText = data.choices?.[0]?.message?.content ?? "";
            }
            const aiResult = parseAiResponse(rawText);
            if (aiResult.success && aiResult.result) {
                try {
                    JSON.parse(aiResult.result);
                    editorRef.current?.setValue(aiResult.result);
                    setAiStatus("success");
                    setTimeout(() => setAiStatus("idle"), 2500);
                }
                catch {
                    setAiStatus("fail");
                    setAiMessage("AI 修复结果不是有效 JSON，请手动检查");
                }
            }
            else {
                setAiStatus("fail");
                setAiMessage(aiResult.reason ?? "AI 无法修复此 JSON");
            }
        }
        catch (e) {
            setAiStatus("error");
            setAiMessage(e.message ?? "网络请求失败");
        }
    }
    useEffect(() => {
        if (status !== "ok")
            setViewMode("editor");
    }, [status]);
    const bytes = new Blob([input]).size;
    const sizeLabel = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    const lineCount = input ? input.split("\n").length : 0;
    return (_jsxs("div", { className: "app", "data-theme": theme, children: [_jsxs("div", { ref: titleBarRef, className: "titlebar", "data-tauri-drag-region": true, children: [_jsx("span", { className: "title", children: "JSON Editor" }), _jsxs("div", { className: "titlebar-actions", children: [_jsx("button", { className: "theme-toggle", onClick: openSettings, title: "AI \u8BBE\u7F6E", children: "\u2699" }), import.meta.env.DEV && _jsx("button", { className: "theme-toggle", onClick: loadSample, title: "\u52A0\u8F7D\u793A\u4F8B", children: "\u2726" }), _jsx("button", { className: "theme-toggle", onClick: () => editorRef.current?.setValue(""), title: "\u6E05\u7A7A", children: "\u2715" }), _jsx("button", { className: "theme-toggle", onClick: () => setTheme(t => {
                                    const next = t === "dark" ? "light" : "dark";
                                    localStorage.setItem("theme", next);
                                    return next;
                                }), title: theme === "dark" ? "切换亮色主题" : "切换暗色主题", children: theme === "dark" ? "☀" : "☾" })] })] }), _jsx("div", { className: "toolbar", children: _jsxs("div", { className: "view-switcher", children: [_jsx("button", { className: `view-switcher-btn${viewMode === "editor" ? " active" : ""}`, onClick: () => setViewMode("editor"), children: "\u7F16\u8F91\u89C6\u56FE" }), _jsx("button", { className: `view-switcher-btn${viewMode === "tree" ? " active" : ""}`, onClick: () => setViewMode("tree"), disabled: status !== "ok", children: "\u6811\u5F62\u89C6\u56FE" })] }) }), _jsxs("div", { className: "main", children: [_jsxs("div", { className: "pane left-pane", style: { width: "100%", display: viewMode === "editor" ? "flex" : "none" }, children: [_jsxs("div", { className: "editor-wrap", children: [input && (_jsx("button", { className: "editor-copy-btn icon-btn", onClick: copyInput, onMouseLeave: () => setCopiedInput(false), title: copiedInput ? "已复制" : "复制", children: copiedInput ? _jsx(IconCopied, {}) : _jsx(IconCopy, {}) })), _jsx(Editor, { height: "100%", defaultLanguage: "json", theme: theme === "dark" ? "vs-dark" : "vs", options: {
                                            fontSize: 13.5, lineHeight: 24,
                                            minimap: { enabled: false },
                                            scrollBeyondLastLine: false,
                                            scrollbar: {
                                                verticalScrollbarSize: 6,
                                                horizontalScrollbarSize: 6,
                                                useShadows: false,
                                            },
                                            renderLineHighlight: "none",
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontLigatures: true,
                                            padding: { top: 16, bottom: 16 },
                                            tabSize: 2,
                                        }, onChange: handleChange, onMount: handleEditorMount })] }), (status === "error" || aiStatus === "fail" || aiStatus === "error") && (_jsxs("div", { className: `error-bar${aiStatus === "fail" || aiStatus === "error" ? " warn" : ""}`, children: [_jsx("span", { className: "error-bar-text", children: aiStatus === "fail" || aiStatus === "error" ? `⚠ ${aiMessage}` : `⚠ ${error}` }), status === "error" && aiStatus === "idle" && (_jsx("button", { className: "ai-fix-btn", onClick: repairWithAI, children: "\u2726 AI \u4FEE\u590D" })), aiStatus === "loading" && (_jsx("button", { className: "ai-fix-btn loading", disabled: true, children: "\u27F3 \u4FEE\u590D\u4E2D..." })), (aiStatus === "fail" || aiStatus === "error") && (_jsxs(_Fragment, { children: [_jsx("button", { className: "ai-fix-btn", onClick: repairWithAI, children: "\u21BA \u91CD\u8BD5" }), _jsx("button", { className: "ai-close-btn", onClick: () => setAiStatus("idle"), children: "\u2715" })] }))] })), aiStatus === "success" && _jsx("div", { className: "ai-success-bar", children: "\u2713 AI \u5DF2\u4FEE\u590D" })] }), _jsx("div", { className: "pane right-pane", style: { width: "100%", display: viewMode === "tree" ? "flex" : "none" }, children: _jsxs("div", { className: "pane-body", children: [parsed !== null && (_jsxs(_Fragment, { children: [_jsx("button", { className: "editor-copy-btn icon-btn", onClick: copyOutput, onMouseLeave: () => setCopiedOutput(false), title: copiedOutput ? "已复制" : "复制", children: copiedOutput ? _jsx(IconCopied, {}) : _jsx(IconCopy, {}) }), _jsxs("div", { className: "tree-actions", children: [_jsx("button", { className: "editor-copy-btn icon-btn", onClick: () => setExpandAllKey(k => k + 1), title: "\u5168\u90E8\u5C55\u5F00", children: _jsx(IconExpandAll, {}) }), _jsx("button", { className: "editor-copy-btn icon-btn", onClick: () => setCollapseKey(k => k + 1), title: "\u5168\u90E8\u6536\u8D77", children: _jsx(IconCollapseAll, {}) })] })] })), _jsx("div", { className: "tree-view", children: parsed !== null ? (_jsx(TreeNodeRow, { keyName: null, value: parsed, depth: 0, collapseKey: collapseKey, expandAllKey: expandAllKey })) : (_jsxs("div", { className: "empty", children: [_jsx("div", { className: "big", children: "{}" }), _jsx("div", { children: "\u8F93\u5165 JSON \u67E5\u770B\u6811\u5F62\u7ED3\u6784" })] })) })] }) })] }), _jsxs("div", { className: "footer", children: [_jsxs("span", { children: ["\u884C ", _jsx("b", { children: input ? lineCount : "—" })] }), _jsxs("span", { children: ["\u5B57\u7B26 ", _jsx("b", { children: input ? input.length : "—" })] }), _jsxs("span", { children: ["\u5927\u5C0F ", _jsx("b", { children: input ? sizeLabel : "—" })] }), _jsx("div", { style: { flex: 1 } }), _jsx("span", { children: "UTF-8 \u00B7 JSON" })] }), showSettings && (_jsx("div", { className: "modal-overlay", onClick: () => setShowSettings(false), children: _jsxs("div", { className: "modal", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsx("span", { children: "AI \u8BBE\u7F6E" }), _jsx("button", { className: "modal-close", onClick: () => setShowSettings(false), children: "\u2715" })] }), _jsxs("div", { className: "modal-body", children: [_jsx("label", { className: "modal-label", children: "\u6A21\u578B" }), _jsx("select", { className: "modal-select", value: providerDraft, onChange: e => {
                                        setProviderDraft(e.target.value);
                                        setApiKeyDraft(apiKeys[e.target.value] ?? "");
                                    }, children: PROVIDERS.map(p => (_jsx("option", { value: p.id, children: p.name }, p.id))) }), _jsx("label", { className: "modal-label", style: { marginTop: 14 }, children: "API Key" }), _jsx("input", { className: "modal-input", type: "password", placeholder: PROVIDERS.find(p => p.id === providerDraft)?.placeholder ?? "", value: apiKeyDraft, onChange: e => setApiKeyDraft(e.target.value), onKeyDown: e => { if (e.key === "Enter")
                                        saveSettings(); }, autoFocus: true }), _jsx("p", { className: "modal-hint", children: "API Key \u4EC5\u4FDD\u5B58\u5728\u672C\u5730 localStorage\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u3002" })] }), _jsxs("div", { className: "modal-footer", children: [_jsx("button", { className: "modal-btn", onClick: () => setShowSettings(false), children: "\u53D6\u6D88" }), _jsx("button", { className: "modal-btn primary", onClick: saveSettings, children: "\u4FDD\u5B58" })] })] }) }))] }));
}
