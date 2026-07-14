(function () {
    "use strict";
    const MANIFEST = { id: "Terminal.feature", type: "feature", layer: 1, runtime: "Browser", version: "5.0.1", requires: ["SpawnShell.workflow"], dependencies: ["SpawnShell.workflow"], capabilities: ["terminal:mount", "terminal:unmount", "terminal:newTab", "terminal:closeTab", "terminal:sendInput"], dataFiles: [], lifecycle: ["mount", "unmount"], actions: { commands: { mount: { description: "Mount.", input: { container: "HTMLElement", sessionId: "string?", shell: "string?" }, output: "void" }, unmount: { description: "Unmount.", input: { container: "HTMLElement" }, output: "void" }, newTab: { description: "New tab.", input: { shell: "string?" }, output: "void" }, closeTab: { description: "Close tab.", input: { tabId: "string" }, output: "void" }, sendInput: { description: "Send input.", input: { text: "string" }, output: "void" } }, events: { "terminal:sessionStarted": { payload: { sessionId: "string", shell: "string" } }, "terminal:sessionEnded": { payload: { sessionId: "string", exitCode: "number" } }, "terminal:output": { payload: { sessionId: "string", data: "string" } } }, accepts: { "shell:output": { description: "Output" }, "shell:exit": { description: "Exit" } }, slots: { toolbar: { description: "Toolbar" } } }, backendDeps: ["SpawnShell.workflow"], docs: { description: "Interactive terminal.", author: "ProtoAI Core Architecture Group", sdoa: "5.0.0" }, last_modified: "2026-07-13T00:00:00Z" };
    var _sessions = {}, _activeTab = null, _tabCount = 0, _container = null, _resizeObserver = null;
    function _ansiToHtml(str) {
        let esc = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), open = false;
        const colors = { 30: "#1a1a2e", 31: "#ef4444", 32: "#22c55e", 33: "#f59e0b", 34: "#4f8cff", 35: "#a855f7", 36: "#06b6d4", 37: "#e2e2e8", 90: "#6b7280", 91: "#f87171", 92: "#4ade80", 93: "#fbbf24", 94: "#60a5fa", 95: "#c084fc", 96: "#22d3ee", 97: "#ffffff" };
        esc = esc.replace(/\x1b\[([0-9;]*)m/g, (m, cStr) => {
            let res = ""; if (cStr.split(";").map(Number).includes(0) || cStr === "") { if (open) { res += "</span>"; open = false; } }
            for (const c of cStr.split(";").map(Number)) { if (colors[c]) { if (open) res += "</span>"; res += `<span style="color:${colors[c]}">`; open = true; } }
            return res;
        });
        return (open ? esc + "</span>" : esc).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
    }
    function _onResize() {
        if (!_container) return;
        const r = _container.getBoundingClientRect(), cols = Math.floor(r.width / 8), rows = Math.floor(r.height / 17);
        Object.keys(_sessions).forEach(id => { if (_sessions[id].term) _sessions[id].term.resize(cols, rows); });
    }
    function _openTab(shell) {
        const tabId = "tab-" + (++_tabCount), tabbar = _container.querySelector(".sdoa-term-tabs"), tabBtn = document.createElement("button");
        tabBtn.className = "sdoa-term-tab"; tabBtn.setAttribute("data-tab-id", tabId);
        tabBtn.innerHTML = `Shell ${_tabCount} <span class="sdoa-term-close">x</span>`;
        tabBtn.addEventListener("click", (e) => e.target.classList.contains("sdoa-term-close") ? (e.stopPropagation(), closeTab({ tabId })) : _activateTab(tabId));
        tabbar.appendChild(tabBtn);
        const panes = _container.querySelector(".sdoa-term-panes"), paneEl = document.createElement("div");
        paneEl.className = "sdoa-term-pane"; paneEl.setAttribute("data-tab-id", tabId); panes.appendChild(paneEl);
        let term = null, output = null, input = null, history = [], histIdx = -1;
        if (window.Terminal) {
            term = new window.Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Cascadia Code, Consolas, monospace', theme: { background: '#0d0d0f', foreground: '#e2e2e8', cursor: '#4f8cff', selection: 'rgba(79,140,255,0.2)' } });
            term.open(paneEl); term.onData(d => _sendInput(tabId, d));
        } else {
            paneEl.innerHTML = `<pre class="sdoa-term-output"></pre><input type="text" class="sdoa-term-input" placeholder="Type command here..." />`;
            input = paneEl.querySelector(".sdoa-term-input"); output = paneEl.querySelector(".sdoa-term-output");
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    const val = input.value; if (val.trim()) { history.push(val); histIdx = -1; _sendInput(tabId, val + "\n"); }
                    input.value = "";
                } else if (e.key === "ArrowUp" && history.length) {
                    e.preventDefault(); histIdx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1); input.value = history[histIdx];
                } else if (e.key === "ArrowDown" && history.length && histIdx !== -1) {
                    e.preventDefault(); histIdx = histIdx === history.length - 1 ? -1 : histIdx + 1; input.value = histIdx === -1 ? "" : history[histIdx];
                }
            });
        }
        _sessions[tabId] = { paneEl, tabBtn, term, output, input, history };
        _activateTab(tabId);
        window.backendConnector?.runWorkflow("SpawnShell.workflow", { action: "run", shell: shell || "powershell", sessionId: tabId }).then(r => {
            if (r && !r.ok) {
                const err = `\nError spawning: ${r.error}`;
                if (term) term.write(err); else if (output) output.innerHTML += `<span style="color:#ef4444">${err}</span>`;
            }
        });
    }
    function _activateTab(tabId) {
        Object.keys(_sessions).forEach(id => {
            _sessions[id].paneEl.classList.toggle("sdoa-term-pane--active", id === tabId);
            _sessions[id].tabBtn.classList.toggle("sdoa-term-tab--active", id === tabId);
        });
        _activeTab = tabId;
        const act = _sessions[tabId]; if (act) { if (act.term) act.term.focus(); else if (act.input) act.input.focus(); }
    }
    function _sendInput(tabId, data) {
        window.backendConnector?.runWorkflow("SpawnShell.workflow", { action: "sendInput", sessionId: tabId, data });
    }
    function mount(config = {}) {
        _container = config.container;
        _container.innerHTML = `<div class="sdoa-terminal"><div class="sdoa-term-tabbar"><div class="sdoa-term-tabs"></div><button class="sdoa-term-add">+</button></div><div class="sdoa-term-panes"></div></div>`;
        _container.querySelector(".sdoa-term-add").addEventListener("click", () => _openTab(config.shell));
        _openTab(config.shell);
        _resizeObserver = new ResizeObserver(() => _onResize());
        _resizeObserver.observe(_container);
    }
    function unmount() {
        Object.keys(_sessions).forEach(tabId => {
            const s = _sessions[tabId]; window.backendConnector?.runWorkflow("SpawnShell.workflow", { action: "kill", sessionId: tabId });
            if (s.term) s.term.dispose();
        });
        if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
        if (_container) _container.innerHTML = "";
        _sessions = {}; _activeTab = null; _tabCount = 0;
    }
    function newTab({ shell } = {}) { _openTab(shell); }
    function closeTab({ tabId } = {}) {
        const s = _sessions[tabId]; if (!s) return;
        window.backendConnector?.runWorkflow("SpawnShell.workflow", { action: "kill", sessionId: tabId });
        if (s.term) s.term.dispose();
        s.paneEl.remove(); s.tabBtn.remove(); delete _sessions[tabId];
        if (_activeTab === tabId) {
            const rem = Object.keys(_sessions);
            if (rem.length) _activateTab(rem[rem.length - 1]); else _activeTab = null;
        }
    }
    function sendInput({ text } = {}) { if (_activeTab) _sendInput(_activeTab, text); }
    if (window.EventBus) {
        window.EventBus.on("shell:output", ({ sessionId, data }) => {
            const s = _sessions[sessionId]; if (s) { if (s.term) s.term.write(data); else { s.output.innerHTML += _ansiToHtml(data); s.output.scrollTop = s.output.scrollHeight; } }
        });
        window.EventBus.on("shell:exit", ({ sessionId, exitCode }) => {
            const s = _sessions[sessionId]; if (s) {
                const msg = `\n[Process exited with code ${exitCode}]`;
                if (s.term) s.term.write(msg); else { s.output.innerHTML += msg; s.input.disabled = true; }
            }
        });
    }
    window.TerminalFeature = { MANIFEST, mount, unmount, newTab, closeTab, sendInput };
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, window.TerminalFeature);
})();
