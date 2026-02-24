import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// ── Types ──────────────────────────────────────────────────────────────────
type Status = "idle" | "ok" | "error";
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
  keyName, value, depth,
}: { keyName: string | null; value: unknown; depth: number }) {
  const [open, setOpen] = useState(true);
  const isObj = typeof value === "object" && value !== null;

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
      {open && (
        <>
          {entries.map(([k, v]) => (
            <TreeNodeRow key={k} keyName={isArr ? null : k} value={v} depth={depth + 1} />
          ))}
          <div className="tree-row" style={{ paddingLeft: indent }}>
            <span className="bracket">{close_}</span>
          </div>
        </>
      )}
    </div>
  );
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
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("theme") as "dark" | "light") ?? "dark"
  );
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const titlebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = titlebarRef.current;
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
    setTimeout(() => setCopiedInput(false), 1500);
  }

  async function copyOutput() {
    if (!parsed) return;
    await writeText(JSON.stringify(parsed, null, 2));
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 1500);
  }

  function loadSample() {
    const sample = {
      name: "json-editor", version: "1.0.0",
      author: { name: "Claude", email: "hello@anthropic.com" },
      features: ["格式化", "压缩", "排序", "树形预览"],
      config: { theme: "dark", fontSize: 14, tabSize: 2, wordWrap: true },
      stats: { stars: 2048, active: true, score: 9.8 },
      license: null,
    };
    editorRef.current?.setValue(JSON.stringify(sample, null, 2));
  }

  const bytes = new Blob([input]).size;
  const sizeLabel = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  const lineCount = input ? input.split("\n").length : 0;

  return (
    <div className="app" data-theme={theme}>
      {/* Titlebar */}
      <div ref={titlebarRef} className="titlebar" data-tauri-drag-region>
        <span className="title">JSON Editor</span>
        <div className="titlebar-actions">
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
        <button className="btn primary" onClick={format}>⌘ 格式化</button>
        <button className="btn" onClick={minify}>⇲ 压缩</button>
<button className="btn" onClick={loadSample}>✦ 示例</button>
        <button className="btn danger" onClick={() => editorRef.current?.setValue("")}>✕ 清空</button>
        <div className="spacer" />
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
            <span>输入</span>
            <button className="pane-copy-btn" onClick={copyInput} disabled={!input}>
              {copiedInput ? "✓ 已复制" : "⎘ 复制"}
            </button>
          </div>
          <div className="editor-wrap">
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
          {error && <div className="error-bar">⚠ {error}</div>}
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
            <button className="pane-copy-btn" onClick={copyOutput} disabled={!parsed}>
              {copiedOutput ? "✓ 已复制" : "⎘ 复制 JSON"}
            </button>
          </div>
          <div className="pane-body">
            {tab === "tree" && (
              <div className="tree-view">
                {parsed !== null ? (
                  <TreeNodeRow keyName={null} value={parsed} depth={0} />
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
    </div>
  );
}
