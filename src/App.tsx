import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// ── Types ──────────────────────────────────────────────────────────────────
type Status = "idle" | "ok" | "error";
type AiStatus = "idle" | "loading" | "success" | "fail" | "error";
type TabId = "tree" | "text";

// ── Tree helpers ───────────────────────────────────────────────────────────
function JsonValue({ value }: { value: unknown }) {
  if (value === null) return <span className="null">null</span>;
  if (typeof value === "boolean") return <span className="bool">{String(value)}</span>;
  if (typeof value === "number") return <span className="num">{value}</span>;
  if (typeof value === "string") return <span className="str">"{value}"</span>;
  return null;
}

function TreeNodeRow({
  keyName, value, depth, collapseKey = 0, expandAllKey = 0,
}: { keyName: string | null; value: unknown; depth: number; collapseKey?: number; expandAllKey?: number }) {
  const [open, setOpen] = useState(true);
  const isObj = typeof value === "object" && value !== null;

  useEffect(() => {
    if (collapseKey > 0) setOpen(false);
  }, [collapseKey]);

  useEffect(() => {
    if (expandAllKey > 0) setOpen(true);
  }, [expandAllKey]);

  const indent = depth * 20;

  if (!isObj) {
    return (
      <div className="tree-row" style={{ paddingLeft: indent + 4 }}>
        {keyName !== null && <><span className="tree-key">"{keyName}"</span><span className="colon">: </span></>}
        <JsonValue value={value} />
      </div>
    );
  }

  const isArr = Array.isArray(value);
  const entries = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);
  const [open_, close_] = isArr ? ["[", "]"] : ["{", "}"];

  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: indent }}>
        <button className={`expand-btn ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>▶</button>
        {keyName !== null && <><span className="tree-key">"{keyName}"</span><span className="colon">: </span></>}
        <span className="bracket">{open_}</span>
        {!open && <span className="hint">{entries.length} {isArr ? "items" : "keys"}</span>}
        {!open && <span className="bracket">{close_}</span>}
      </div>
      <div style={{ display: open ? undefined : "none" }}>
        {entries.map(([k, v]) => (
          <TreeNodeRow key={k} keyName={isArr ? null : k} value={v} depth={depth + 1} collapseKey={collapseKey} expandAllKey={expandAllKey} />
        ))}
        <div className="tree-row" style={{ paddingLeft: indent }}>
          <span className="bracket">{close_}</span>
        </div>
      </div>
    </div>
  );
}

// ── AI helpers ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a JSON repair assistant. Given broken JSON, respond ONLY with a JSON object (no markdown):
{"success": true, "result": "...repaired json as escaped string..."}
OR
{"success": false, "reason": "...中文失败原因，最多80字..."}
Common fixable: trailing commas, single quotes, unquoted keys, missing commas, JS comments.
Return success=false only when structure is ambiguous or semantically broken.`;

function parseAiResponse(raw: string): { success: boolean; result?: string; reason?: string } {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
  }
  return { success: false, reason: "AI 返回格式异常，无法解析" };
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<unknown>(null);
  const [tab, setTab] = useState<TabId>("tree");
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [collapseKey, setCollapseKey] = useState(0);
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("theme") as "dark" | "light") ?? "dark"
  );
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("ai_api_key") ?? "");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = titleBarRef.current;
    if (!el) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      getCurrentWindow().startDragging().catch(() => {});
    };
    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, []);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleChange = useCallback((val: string | undefined) => {
    const v = val ?? "";
    setInput(v);
    setAiStatus("idle");
    if (!v.trim()) { setStatus("idle"); setError(""); setParsed(null); return; }
    try {
      const data = JSON.parse(v);
      setStatus("ok"); setError(""); setParsed(data);
    } catch (e: unknown) {
      setStatus("error");
      setError((e as Error).message);
      setParsed(null);
    }
  }, []);

  function format() {
    if (!parsed) return;
    const formatted = JSON.stringify(parsed, null, 2);
    editorRef.current?.setValue(formatted);
  }

  function minify() {
    if (!parsed) return;
    editorRef.current?.setValue(JSON.stringify(parsed));
  }

  async function copyInput() {
    await writeText(input);
    setCopiedInput(true);
  }

  async function copyOutput() {
    if (!parsed) return;
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

  async function repairWithAI() {
    if (!apiKey) {
      setApiKeyDraft("");
      setShowSettings(true);
      return;
    }
    setAiStatus("loading");
    const inputText = input.length > 8000 ? input.slice(0, 8000) : input;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: inputText }],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawText = data.content?.[0]?.text ?? "";
      const aiResult = parseAiResponse(rawText);
      if (aiResult.success && aiResult.result) {
        try {
          JSON.parse(aiResult.result);
          editorRef.current?.setValue(aiResult.result);
          setAiStatus("success");
          setTimeout(() => setAiStatus("idle"), 2500);
        } catch {
          setAiStatus("fail");
          setAiMessage("AI 修复结果不是有效 JSON，请手动检查");
        }
      } else {
        setAiStatus("fail");
        setAiMessage(aiResult.reason ?? "AI 无法修复此 JSON");
      }
    } catch (e: unknown) {
      setAiStatus("error");
      setAiMessage((e as Error).message ?? "网络请求失败");
    }
  }

  const bytes = new Blob([input]).size;
  const sizeLabel = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  const lineCount = input ? input.split("\n").length : 0;

  return (
    <div className="app" data-theme={theme}>
      {/* Titlebar */}
      <div ref={titleBarRef} className="titlebar" data-tauri-drag-region>
        <span className="title">JSON Editor</span>
        <div className="titlebar-actions">
          <button className="theme-toggle" onClick={() => { setApiKeyDraft(apiKey); setShowSettings(true); }} title="AI 设置">⚙</button>
          <button className="theme-toggle" onClick={loadSample} title="加载示例">✦</button>
          <button className="theme-toggle" onClick={() => editorRef.current?.setValue("")} title="清空">✕</button>
          <button className="theme-toggle" onClick={() => setTheme(t => {
              const next = t === "dark" ? "light" : "dark";
              localStorage.setItem("theme", next);
              return next;
            })} title={theme === "dark" ? "切换亮色主题" : "切换暗色主题"}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <span className="badge">v1.0</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className={`status-pill ${status}`}>
          <span className="dot" />
          {status === "idle" ? "等待输入" : status === "ok" ? "✓ 有效 JSON" : "✗ 语法错误"}
        </div>
      </div>

      {/* Main */}
      <div className="main">
        {/* Left: Monaco Editor */}
        <div className="pane left-pane">
          <div className="pane-header">
            <div className="pane-header-left">
              <span>输入</span>
            </div>
            <div className="pane-header-right">
              {parsed !== null && (
                <button className="pane-copy-btn" onClick={minify}>⇲ 压缩</button>
              )}
            </div>
          </div>
          <div className="editor-wrap">
            {input && (
              <button className="editor-copy-btn" onClick={copyInput} onMouseLeave={() => setCopiedInput(false)}>
                {copiedInput ? "✓ 已复制" : "⎘ 复制"}
              </button>
            )}
            <Editor
              height="100%"
              defaultLanguage="json"
              theme={theme === "dark" ? "vs-dark" : "vs"}
              options={{
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
              }}
              onChange={handleChange}
              onMount={handleEditorMount}
            />
          </div>
          {(status === "error" || aiStatus === "fail" || aiStatus === "error") && (
            <div className={`error-bar${aiStatus === "fail" || aiStatus === "error" ? " warn" : ""}`}>
              <span className="error-bar-text">
                {aiStatus === "fail" || aiStatus === "error" ? `⚠ ${aiMessage}` : `⚠ ${error}`}
              </span>
              {status === "error" && aiStatus === "idle" && (
                <button className="ai-fix-btn" onClick={repairWithAI}>✦ AI 修复</button>
              )}
              {aiStatus === "loading" && (
                <button className="ai-fix-btn loading" disabled>⟳ 修复中...</button>
              )}
              {(aiStatus === "fail" || aiStatus === "error") && (
                <>
                  <button className="ai-fix-btn" onClick={repairWithAI}>↺ 重试</button>
                  <button className="ai-close-btn" onClick={() => setAiStatus("idle")}>✕</button>
                </>
              )}
            </div>
          )}
          {aiStatus === "success" && <div className="ai-success-bar">✓ AI 已修复</div>}
        </div>

        {/* Right: Tree / Text tabs */}
        <div className="pane right-pane">
          <div className="pane-header">
            <div className="pane-header-left">
              <span>输出</span>
              <div className="tabs">
                <button className={`tab ${tab === "tree" ? "active" : ""}`} onClick={() => setTab("tree")}>树形预览</button>
                <button className={`tab ${tab === "text" ? "active" : ""}`} onClick={() => setTab("text")}>文本预览</button>
              </div>
            </div>
            <div className="pane-header-right">
              {tab === "tree" && parsed !== null && (
                <>
                  <button className="pane-copy-btn" onClick={() => setExpandAllKey(k => k + 1)}>⊞ 全部展开</button>
                  <button className="pane-copy-btn" onClick={() => setCollapseKey(k => k + 1)}>⊟ 全部收起</button>
                </>
              )}
            </div>
          </div>
          <div className="pane-body">
            {parsed !== null && (
              <button className="editor-copy-btn" onClick={copyOutput} onMouseLeave={() => setCopiedOutput(false)}>
                {copiedOutput ? "✓ 已复制" : "⎘ 复制"}
              </button>
            )}
            {tab === "tree" && (
              <div className="tree-view">
                {parsed !== null ? (
                  <TreeNodeRow keyName={null} value={parsed} depth={0} collapseKey={collapseKey} expandAllKey={expandAllKey} />
                ) : (
                  <div className="empty">
                    <div className="big">{ "{}" }</div>
                    <div>输入 JSON 查看树形结构</div>
                  </div>
                )}
              </div>
            )}
            {tab === "text" && (
              <div className="output-view">
                <pre>{parsed !== null ? JSON.stringify(parsed, null, 2) : "// 等待有效 JSON..."}</pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <span>行 <b>{input ? lineCount : "—"}</b></span>
        <span>字符 <b>{input ? input.length : "—"}</b></span>
        <span>大小 <b>{input ? sizeLabel : "—"}</b></span>
        <div style={{ flex: 1 }} />
        <span>UTF-8 · JSON</span>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>AI 设置</span>
              <button className="modal-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">Claude API Key</label>
              <input
                className="modal-input"
                type="password"
                placeholder="sk-ant-..."
                value={apiKeyDraft}
                onChange={e => setApiKeyDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    localStorage.setItem("ai_api_key", apiKeyDraft);
                    setApiKey(apiKeyDraft);
                    setShowSettings(false);
                  }
                }}
                autoFocus
              />
              <p className="modal-hint">API Key 仅保存在本地 localStorage，不会上传。</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn" onClick={() => setShowSettings(false)}>取消</button>
              <button className="modal-btn primary" onClick={() => {
                localStorage.setItem("ai_api_key", apiKeyDraft);
                setApiKey(apiKeyDraft);
                setShowSettings(false);
              }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
