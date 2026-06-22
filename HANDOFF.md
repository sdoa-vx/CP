# SDOA Engine v1.1.0 — Handoff Document

This document provides a comprehensive overview of the **SDOA Migration Engine** (v1.1.0) architecture, features, and workflows. It serves as a guide for developers taking over or continuing work on the codebase.

---

## 1. High-Level Architecture

The SDOA Engine is a hybrid application comprising a **VS Code Extension** (frontend/client) and a **Node.js Express Server** (backend/engine).

### **The VS Code Extension (`/extension`)**
- Acts as the primary user interface inside the IDE.
- Automatically spawns the backend server as a child process when activated (uses `onStartupFinished` to ensure the server and Status Bar UI are immediately available upon loading the IDE).
- Injects a native "SDOA Engine" **Activity Bar** icon (using `SDOA.seal.svg`) and a custom **Tree View** Control Panel.
- Registers core commands (`sdoa.scanFile`, `sdoa.scanFolder`, `sdoa.restartEngine`, etc.) that communicate with the backend via REST.
- Contains the `globalAstEngine` and `innovationDetector` to parse active text documents and offer extraction "Fix-It" UI prompts natively via VS Code's diff views.

### **The Backend Server (`/server`)**
- An Express server running on `http://localhost:8080`.
- Acts as an **MCP (Model Context Protocol)** host for AI agents.
- Provides a **Web Dashboard** (`/dashboard`) hosted statically from `/server/public`.
- Uses a local **SQLite database** (`.sdoa/pipeline.db`) to track parsed AST clusters, detected primitives, and submission queues.
- Exposes a live **Server-Sent Events (SSE)** stream (`/dashboard/api/events`) for real-time telemetry and engine logs.

---

## 2. Core Features Implemented in v1.1.0

### **Unified Control Center Dashboard**
A sleek, premium, dark-mode web dashboard accessible via `http://localhost:8080/dashboard` or through the VS Code Control Panel.
- **Live Telemetry:** Polling engine state, AST cache size, SQLite entries, and queue depth.
- **Event Stream:** A real-time scrolling terminal output powered by SSE (`server/src/engine/events.ts`).
- **Quick Actions:** Native HTML buttons to trigger file/folder scans across the workspace.

### **Interactive Status Bar Scanning**
A unified Status Bar widget (`Scan SDOA`) provides quick access to scanning functionalities.
- Triggers a VS Code **Quick Pick Menu** (`sdoa.scanProject`) that allows developers to precisely choose their scan target:
  - **Full Workspace**
  - **Active File**
  - **Specific Folder** (via dialog)
  - **Specific File** (via dialog)

### **VS Code Tree View**
The Activity Bar now includes an `sdoa-explorer` container.
- Polls the backend `/dashboard/api/state` every 5 seconds to update the VS Code UI with live stats (Idle/Scanning, Queue Depth, Uptime).
- Exposes quick links to GitHub Releases and GitHub Pages.

### **AST Clustering & Innovation Detection**
- Automatically caches file ASTs upon document save (`globalAstEngine`).
- Detects 5 types of architectural artifacts: UI Primitives, Workflows, Schemas, Tokens, and Engines.
- Powers the "Fix-It" extraction loop: when a reusable component is found, it prompts the user and opens a native VS Code diff window to extract the code to standardized paths (e.g., `ui/primitives/Name.sdoa.tsx`).

---

## 3. Directory Structure

```text
C:\MCP\
├── .sdoa/                  # Local SQLite database (pipeline.db) - Auto-generated
├── extension/              # VS Code Extension source code
│   └── src/
│       ├── extension.ts    # Main entry point & TreeDataProvider
│       ├── detectors/      # AST clustering and AST detection logic
│       ├── ui/             # VS Code native UI prompts & diff views
│       └── api/            # Client wrappers for fetching from localhost:8080
├── release-binaries/       # Standalone compiled binaries (Linux/Mac/Win) - Auto-generated
├── server/                 # Backend Node.js engine
│   ├── bin/                # CLI entry points (mcp-proposals.js)
│   ├── public/             # Static Web Dashboard (index.html, styles.css, dashboard.js)
│   └── src/
│       ├── engine/         # Events (SSE), Telemetry, and pipeline orchestrators
│       ├── routes/         # Express REST API routes
│       └── validators/     # Zod schema validators
├── package.json            # Central manifest for both extension config and npm scripts
├── esbuild.extension.js    # Bundler for the VS Code extension
└── SDOA.seal.svg           # Activity bar SVG icon
```

---

## 4. Build & Release Pipeline

The build process has been consolidated into a few core commands defined in `package.json`.

### **Compiling the Extension & Server**
```bash
npm run build:server     # Compiles /server/src (TypeScript) -> /dist/server
npm run build:extension  # Runs esbuild to bundle /extension/src -> /dist/extension
npm run package:extension # Packages the extension into a .vsix file via vsce
```
**Shortcut:** `npm run release` runs all three sequentially.

### **Packaging Standalone Binaries**
We use `pkg` to compile the backend Node server into zero-dependency, standalone executables for 3 platforms.
- **Command:** `npx pkg . --targets "node18-win-x64,node18-macos-x64,node18-linux-x64" --out-path release-binaries`
- **Output:** Three large executable files (~80MB each) placed in the `release-binaries/` directory.
- **Note:** Native modules like `better-sqlite3` may generate warnings during `pkg` bytecode generation, but the binaries are functional.

### **Publishing to GitHub**
To publish the built `.vsix` extension and the three OS binaries to a new GitHub Release:
```bash
gh release create v1.1.0 sdoa-mcp-extension-1.1.0.vsix "release-binaries/sdoa-mcp-extension-win.exe" "release-binaries/sdoa-mcp-extension-macos" "release-binaries/sdoa-mcp-extension-linux" --title "SDOA Engine v1.1"
```
*(Note: Large binary files must be handled via Releases rather than committed to the repository to avoid GitHub's 100MB file size limit).*

---

## 5. Known Quirks & Recent Fixes

- **`package.json` VS Code Manifest Rules:** VS Code is highly strict about `viewsContainers` icons. They *must* point to valid local SVG files (e.g., `SDOA.seal.svg`), whereas `views` and `commands` can use internal ThemeIcons (e.g., `$(plug)`). If the `viewsContainer` icon is invalid, VS Code will silently drop the entire UI panel. This was recently fixed.
- **Activation Events & vsce Packaging:** While modern VS Code versions can infer activation from the `contributes` section, removing `"activationEvents"` completely breaks the `vsce package` build step if the extension has a `main` entrypoint. We reinstated `"activationEvents": ["onStartupFinished"]` to fix silent build failures and ensure the background Express server boots reliably on startup.
- **PowerShell Array Arguments:** When running `npx pkg --targets` in PowerShell, commas are treated as array separators. To prevent execution failures, the targets string *must* be wrapped in quotes: `"--targets node18-win-x64..."`.
- **Interactive Scanning Overhaul:** Replaced the hardcoded single-file scanning buttons across the extension (Status Bar widget, Tree View Actions, and Control Panel Title menu) with an interactive `sdoa.scanProject` Quick Pick menu, unifying the workspace, file, and folder scanning UX.
- **Git Binary Bloat:** Never commit the `.vsix` or `release-binaries/` files directly to git. They are included in the `.gitignore`.

---

## 6. Next Steps / Future Roadmap

- **Dashboard Heatmap:** The web dashboard currently has a placeholder for an architectural heatmap. Hooking this up to the `globalAstEngine` cache to visualize code density would be a strong next step.
- **Authentication:** The dashboard currently uses hardcoded Basic Auth (`admin:admin`). This should be migrated to token-based auth or local secure port logic.
- **MCP Tool Integration:** Expand the MCP backend so external LLM agents can query the `pipeline.db` directly via standardized MCP JSON-RPC protocols.
