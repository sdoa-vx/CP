/* ============================================================
   CodeEditor.prim.js — Monaco Editor Primitive (SDOA v4)
   version: 1.0.0

   Wraps the bundled minimal Monaco loader so any feature can
   mount a syntax-highlighted editor into any container.

   Usage:
     const editor = await window.CodeEditorPrim.create(container, {
         language: "javascript",
         value: "// hello",
         readOnly: false,
         theme: "vs-dark",
         onChange: (value) => { ... }
     });
     window.CodeEditorPrim.setValue(editor, "// new content");
     window.CodeEditorPrim.getValue(editor);  // → string
     window.CodeEditorPrim.dispose(editor);
     window.CodeEditorPrim.layout(editor);    // call on container resize
   ============================================================ */

(function () {
    "use strict";

    const MANIFEST = {
        id:      "CodeEditor.prim",
        type:    "primitive",
        layer:   2,
        runtime: "Browser",
        version: "4.0.0",
        requires: [],
        dependencies: [],
        capabilities: [
            "editor:create",
            "editor:getValue",
            "editor:setValue",
            "editor:setLanguage",
            "editor:layout",
            "editor:dispose",
            "editor:focus"
        ],
        docs: {
            description: "Monaco Editor primitive. Lazily loads the bundled AMD Monaco loader and mounts a syntax-highlighted code editor into any container, with graceful textarea degradation if Monaco fails to load.",
            author: "ProtoAI Team"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    let _monacoLoaded  = false;
    let _monacoLoading = false;
    let _loadCallbacks = [];
    let _monaco        = null;

    // ── Monaco loader ─────────────────────────────────────────
    // Uses the bundled AMD loader at lib/monaco/vs/loader.js
    // and the stub editor at lib/monaco/vs/editor/editor.main.js.

    function _loadMonaco() {
        return new Promise((resolve) => {
            if (_monacoLoaded) { resolve(_monaco); return; }
            _loadCallbacks.push(resolve);
            if (_monacoLoading) return;
            _monacoLoading = true;

            // Load AMD loader first
            const loaderScript = document.createElement("script");
            loaderScript.src = "/lib/monaco/vs/loader.js";
            loaderScript.onload = () => {
                // Configure paths then load the editor main
                window.require.config({ paths: { "vs": "/lib/monaco/vs" } });
                window.require(["vs/editor/editor.main"], (monaco) => {
                    _monaco      = monaco || window.monaco;
                    _monacoLoaded = true;
                    const cbs = _loadCallbacks.splice(0);
                    cbs.forEach(cb => cb(_monaco));
                });
            };
            loaderScript.onerror = () => {
                // Fallback: monaco may already be available via <script> tag
                if (window.monaco) {
                    _monaco      = window.monaco;
                    _monacoLoaded = true;
                    const cbs = _loadCallbacks.splice(0);
                    cbs.forEach(cb => cb(_monaco));
                } else {
                    console.error("[CodeEditor.prim] Failed to load Monaco loader.");
                    const cbs = _loadCallbacks.splice(0);
                    cbs.forEach(cb => cb(null));
                }
            };
            document.head.appendChild(loaderScript);
        });
    }

    // ── Public API ────────────────────────────────────────────

    async function create(container, opts = {}) {
        if (!container) { console.error("[CodeEditor.prim] No container provided"); return null; }

        const monaco = await _loadMonaco();
        if (!monaco) {
            // Graceful degradation: plain textarea
            container.innerHTML = `
                <textarea
                    style="width:100%;height:100%;background:var(--bg-deep);color:var(--text);
                           font-family:var(--font-mono);font-size:13px;border:none;
                           padding:12px;resize:none;outline:none;box-sizing:border-box;"
                    spellcheck="false"
                >${_escapeHtml(opts.value || "")}</textarea>
            `;
            const ta = container.querySelector("textarea");
            const fakeEditor = {
                _type: "textarea",
                _el: ta,
                _onChange: opts.onChange || null,
            };
            if (opts.onChange) ta.addEventListener("input", () => opts.onChange(ta.value));
            return fakeEditor;
        }

        // Apply ProtoAI theme
        monaco.editor.defineTheme("protoai-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [],
            colors: {
                "editor.background":          "#0d0f12",
                "editor.foreground":          "#e2e8f0",
                "editorLineNumber.foreground": "#4a5568",
                "editor.selectionBackground": "#1a3a6b",
                "editor.lineHighlightBackground": "#151921",
                "editorCursor.foreground":    "#4f8cff",
            }
        });

        const editor = monaco.editor.create(container, {
            value:          opts.value        || "",
            language:       opts.language      || "plaintext",
            theme:          opts.theme         || "protoai-dark",
            readOnly:       opts.readOnly      || false,
            fontSize:       opts.fontSize      || 13,
            fontFamily:     "JetBrains Mono, Menlo, Monaco, monospace",
            lineNumbers:    opts.lineNumbers   ?? "on",
            minimap:        { enabled: opts.minimap ?? false },
            scrollBeyondLastLine: false,
            wordWrap:       opts.wordWrap      || "off",
            automaticLayout: true,
            tabSize:        opts.tabSize       || 4,
            insertSpaces:   opts.insertSpaces  ?? true,
            renderWhitespace: "selection",
        });

        if (opts.onChange) {
            editor.onDidChangeModelContent(() => {
                opts.onChange(editor.getValue());
            });
        }

        return editor;
    }

    function getValue(editor) {
        if (!editor) return "";
        if (editor._type === "textarea") return editor._el?.value || "";
        return editor.getValue?.() || "";
    }

    function setValue(editor, value) {
        if (!editor) return;
        if (editor._type === "textarea") { if (editor._el) editor._el.value = value || ""; return; }
        editor.setValue?.(value || "");
    }

    function setLanguage(editor, lang) {
        if (!editor || editor._type === "textarea" || !_monaco) return;
        const model = editor.getModel?.();
        if (model) _monaco.editor.setModelLanguage(model, lang || "plaintext");
    }

    function layout(editor) {
        if (!editor || editor._type === "textarea") return;
        editor.layout?.();
    }

    function dispose(editor) {
        if (!editor || editor._type === "textarea") return;
        editor.dispose?.();
    }

    function focus(editor) {
        if (!editor) return;
        if (editor._type === "textarea") { editor._el?.focus(); return; }
        editor.focus?.();
    }

    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // ── Export ────────────────────────────────────────────────

    window.CodeEditorPrim = { MANIFEST, create, getValue, setValue, setLanguage, layout, dispose, focus };

})();
