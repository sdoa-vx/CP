// ──────────────────────────────────────────────────────────────────
// File:    Markdown.prim.js
// Version: 4.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Distributed from _variances to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Last modified: 2026-06-07 00:00 UTC
// Markdown.prim.js — SDOA v4 Primitive | v4.0.0 | layer 2
// Markdown-to-HTML renderer.
//
// Usage:
//   const el = MarkdownPrim.create({ content: "# Hello\n\nWorld" });
//   document.body.appendChild(el);
//
//   el._sdoaUpdate({ content: "## Updated" });
//
//   const html = MarkdownPrim.render("**bold** text");
// ============================================================
(function () {
    "use strict";
    const MANIFEST = {
        id: "Markdown.prim", type: "primitive", layer: 2, runtime: "Browser", version: "4.0.0",
        requires: [], dataFiles: [], lifecycle: [], backendDeps: [],
        actions: {
            commands: {
                create: { description: "Create a markdown container element.", input: "MarkdownConfig", output: "HTMLElement" },
                render: { description: "Render markdown string to HTML string.", input: { content: "string" }, output: "string" },
            },
            events: {}, accepts: {}, slots: {},
        },
        docs: { description: "Markdown renderer. Converts markdown to safe HTML using marked.js if available, with a regex fallback.", author: "ProtoAI team", sdoa: "4.0.0" }
    };
    function _escapeHtml(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }
    function _sanitize(html) {
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
            .replace(/\son\w+\s*=/gi, ' data-removed=');
    }
    function _addCopyButtons(container) {
        container.querySelectorAll('pre').forEach(function(pre) {
            if (pre.querySelector('.sdoa-md-copy-btn')) return;
            var btn = document.createElement('button');
            btn.className = 'sdoa-md-copy-btn';
            btn.textContent = 'Copy';
            btn.addEventListener('click', function() {
                var code = (pre.querySelector('code') || pre).textContent;
                navigator.clipboard && navigator.clipboard.writeText(code).then(function() {
                    btn.textContent = 'Copied!';
                    setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
                });
            });
            pre.style.position = 'relative';
            pre.appendChild(btn);
        });
    }
    // Lightweight regex markdown → HTML when marked.js is absent.
    function _fallbackRender(text) {
        let html = String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        // Fenced code blocks
        html = html.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre class="sdoa-md-pre"><code class="sdoa-md-code sdoa-md-code--block language-${_escapeHtml(lang || "text")}">${code.trim()}</code></pre>`
        );
        // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, "<blockquote class=\"sdoa-md-blockquote\">$1</blockquote>");
        // Headings
        html = html.replace(/^###### (.+)$/gm, "<h6 class=\"sdoa-md-h6\">$1</h6>");
        html = html.replace(/^##### (.+)$/gm,  "<h5 class=\"sdoa-md-h5\">$1</h5>");
        html = html.replace(/^#### (.+)$/gm,   "<h4 class=\"sdoa-md-h4\">$1</h4>");
        html = html.replace(/^### (.+)$/gm,    "<h3 class=\"sdoa-md-h3\">$1</h3>");
        html = html.replace(/^## (.+)$/gm,     "<h2 class=\"sdoa-md-h2\">$1</h2>");
        html = html.replace(/^# (.+)$/gm,      "<h1 class=\"sdoa-md-h1\">$1</h1>");
        // Horizontal rule
        html = html.replace(/^---$/gm, "<hr class=\"sdoa-md-hr\">");
        // Bold + italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
        html = html.replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>");
        html = html.replace(/\*(.+?)\*/g,         "<em>$1</em>");
        // Inline code
        html = html.replace(/`([^`]+)`/g, "<code class=\"sdoa-md-code\">$1</code>");
        // Unordered lists (collect consecutive lines)
        html = html.replace(/((?:^[-*+] .+\n?)+)/gm, (block) => {
            const items = block.trim().split(/\n/).map(line =>
                `<li>${line.replace(/^[-*+] /, "")}</li>`
            ).join("");
            return `<ul class="sdoa-md-list">${items}</ul>`;
        });
        // Ordered lists
        html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
            const items = block.trim().split(/\n/).map(line =>
                `<li>${line.replace(/^\d+\. /, "")}</li>`
            ).join("");
            return `<ol class="sdoa-md-list sdoa-md-list--ordered">${items}</ol>`;
        });
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
            "<a class=\"sdoa-md-link\" href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>"
        );
        // Paragraphs: wrap double-newline-separated blocks
        html = html.replace(/\n{2,}/g, "</p><p class=\"sdoa-md-p\">");
        html = `<p class="sdoa-md-p">${html}</p>`;
        // Remaining single newlines → <br>
        html = html.replace(/\n/g, "<br>");
        // Strip empty paragraphs
        html = html.replace(/<p class="sdoa-md-p"><\/p>/g, "");
        return html;
    }
    function render(text) {
        if (!text) return "";
        if (window.marked && typeof window.marked.parse === "function") {
            try {
                return window.marked.parse(text);
            } catch (err) {
                console.warn("[MarkdownPrim] marked.parse failed, using fallback:", err);
            }
        }
        return _fallbackRender(text);
    }
    // create(config): {content?, id?, className?}
    function create(config = {}) {
        const el = document.createElement("div");
        el.className = "sdoa-markdown";
        if (config.className) el.className += ` ${config.className}`;
        if (config.id) el.id = config.id;
        if (config.content) {
            const renderedHtml = render(config.content);
            el.innerHTML = _sanitize(renderedHtml);
            _addCopyButtons(el);
        }
        el._sdoaUpdate = (newConfig) => {
            if (newConfig.content != null) {
                const renderedHtml = render(newConfig.content);
                el.innerHTML = _sanitize(renderedHtml);
                _addCopyButtons(el);
            }
        };
        return el;
    }
    window.MarkdownPrim = { MANIFEST, render, create };
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, { render, create });
})();
