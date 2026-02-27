# JSON Editor — Tauri + React + Monaco Editor

<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128">
</div>

一个轻量、美观的 JSON 格式化桌面编辑器。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2.0 |
| 后端逻辑 | Rust (serde_json) |
| UI 框架 | React 18 + TypeScript |
| 编辑器组件 | Monaco Editor (VS Code 同款) |
| 样式 | 纯 CSS（无框架） |
| 构建工具 | Vite 5 |

## 功能

- ✅ 实时 JSON 语法验证（Monaco 编辑器错误高亮）
- ✅ 树形结构预览（支持全部展开 / 全部收起）
- ✅ 编辑视图 / 树形视图一键切换
- ✅ 复制到剪贴板（编辑视图与树形视图均支持）
- ✅ 窗口聚焦时自动读取剪贴板 JSON 并格式化填入
- ✅ 文件大小 / 行数 / 字符统计（底部状态栏）
- ✅ 亮色 / 暗色主题切换
- ✅ macOS 原生标题栏样式
- ✅ AI 辅助修复（支持 Claude / DeepSeek，自动修复常见 JSON 错误或给出中文原因）

## 本地开发

### 前提条件

```bash
# 1. 安装 Rust（一条命令搞定）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装 Tauri CLI 依赖的系统库（macOS 通常已满足）
xcode-select --install

# 3. 安装 Node.js（推荐 v18+，用 nvm 管理）
brew install nvm
nvm install 20
```

### 启动

```bash
# 进入项目目录
cd json-editor-tauri

# 安装 npm 依赖
npm install

# 启动开发模式（自动打开桌面窗口 + 热更新）
npm run tauri dev
```

### 打包发布

```bash
# 构建 .app 应用包（输出在 src-tauri/target/release/bundle/）
npm run tauri build
```

## 项目结构

```
json-editor-tauri/
├── src/                    # React 前端
│   ├── App.tsx             # 主组件
│   ├── App.css             # 样式
│   └── main.tsx            # 入口
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # 程序入口
│   │   └── lib.rs          # Tauri 命令（format/minify/validate）
│   ├── Cargo.toml          # Rust 依赖
│   └── tauri.conf.json     # Tauri 配置（窗口、Bundle等）
├── index.html
├── vite.config.ts
└── package.json
```
