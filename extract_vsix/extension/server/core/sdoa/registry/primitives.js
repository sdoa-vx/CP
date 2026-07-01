"use strict";

/**
 * primitives.js — SDOA Canonical UI Primitives Registry
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Section 18 (19 Canonical Primitives),
 * SDOA-Governance-Outline.txt Section 8,
 * _variances/SDOAvX/ui/primitives/Markdown/Markdown.prim.js (exemplar),
 * SDOA-Historical-Timeline.txt (v4.0 — primitives standardized)
 *
 * These are the 19 canonical Layer 2 primitives. Every SDOA UI application
 * composes its features from these atoms. No bespoke one-off components.
 */

const PRIMITIVE_REGISTRY = [
  {
    id:          "Button.prim",
    name:        "Button",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Button/Button.prim.js",
    css:         "ui/primitives/Button/Button.prim.css",
    css_class:   "sdoa-button",
    description: "Interactive button element. Supports primary, secondary, danger, and ghost variants. Configurable label, icon, disabled state, and click handler.",
    capabilities: ["ui.button"]
  },
  {
    id:          "Input.prim",
    name:        "Input",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Input/Input.prim.js",
    css:         "ui/primitives/Input/Input.prim.css",
    css_class:   "sdoa-input",
    description: "Text input field. Supports text, password, email, number types. Configurable placeholder, label, validation state, and change handler.",
    capabilities: ["ui.input"]
  },
  {
    id:          "Toggle.prim",
    name:        "Toggle",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Toggle/Toggle.prim.js",
    css:         "ui/primitives/Toggle/Toggle.prim.css",
    css_class:   "sdoa-toggle",
    description: "Binary toggle switch. On/off state. Configurable label and change handler.",
    capabilities: ["ui.toggle"]
  },
  {
    id:          "Select.prim",
    name:        "Select",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Select/Select.prim.js",
    css:         "ui/primitives/Select/Select.prim.css",
    css_class:   "sdoa-select",
    description: "Dropdown selection. Configurable options array, selected value, placeholder, and change handler.",
    capabilities: ["ui.select"]
  },
  {
    id:          "Panel.prim",
    name:        "Panel",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Panel/Panel.prim.js",
    css:         "ui/primitives/Panel/Panel.prim.css",
    css_class:   "sdoa-panel",
    description: "Container panel with optional title, collapsible state, and slot for content.",
    capabilities: ["ui.panel"]
  },
  {
    id:          "Modal.prim",
    name:        "Modal",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Modal/Modal.prim.js",
    css:         "ui/primitives/Modal/Modal.prim.css",
    css_class:   "sdoa-modal",
    description: "Overlay modal dialog. Configurable title, body slot, action buttons, and dismiss handler.",
    capabilities: ["ui.modal"]
  },
  {
    id:          "TabGroup.prim",
    name:        "TabGroup",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/TabGroup/TabGroup.prim.js",
    css:         "ui/primitives/TabGroup/TabGroup.prim.css",
    css_class:   "sdoa-tab-group",
    description: "Tabbed navigation component. Configurable tabs array (label, id, content slot). Manages active tab state.",
    capabilities: ["ui.tabgroup"]
  },
  {
    id:          "List.prim",
    name:        "List",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/List/List.prim.js",
    css:         "ui/primitives/List/List.prim.css",
    css_class:   "sdoa-list",
    description: "Generic list renderer. Configurable items array with render function. Supports selection and empty state.",
    capabilities: ["ui.list"]
  },
  {
    id:          "Tree.prim",
    name:        "Tree",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Tree/Tree.prim.js",
    css:         "ui/primitives/Tree/Tree.prim.css",
    css_class:   "sdoa-tree",
    description: "Hierarchical tree view. Configurable nodes array with expand/collapse state and selection handler.",
    capabilities: ["ui.tree"]
  },
  {
    id:          "Form.prim",
    name:        "Form",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Form/Form.prim.js",
    css:         "ui/primitives/Form/Form.prim.css",
    css_class:   "sdoa-form",
    description: "Schema-driven form renderer. Renders fields from a schema definition. Manages validation and submit.",
    capabilities: ["ui.form"]
  },
  {
    id:          "Toast.prim",
    name:        "Toast",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Toast/Toast.prim.js",
    css:         "ui/primitives/Toast/Toast.prim.css",
    css_class:   "sdoa-toast",
    description: "Transient notification message. Success, warning, error, info variants. Auto-dismiss with configurable duration.",
    capabilities: ["ui.toast"]
  },
  {
    id:          "Badge.prim",
    name:        "Badge",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Badge/Badge.prim.js",
    css:         "ui/primitives/Badge/Badge.prim.css",
    css_class:   "sdoa-badge",
    description: "Small status indicator. Configurable label, color variant, and size.",
    capabilities: ["ui.badge"]
  },
  {
    id:          "Toolbar.prim",
    name:        "Toolbar",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Toolbar/Toolbar.prim.js",
    css:         "ui/primitives/Toolbar/Toolbar.prim.css",
    css_class:   "sdoa-toolbar",
    description: "Horizontal action bar. Configurable actions array (Button configs). Groups and separators.",
    capabilities: ["ui.toolbar"]
  },
  {
    id:          "EmptyState.prim",
    name:        "EmptyState",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/EmptyState/EmptyState.prim.js",
    css:         "ui/primitives/EmptyState/EmptyState.prim.css",
    css_class:   "sdoa-empty-state",
    description: "Empty content placeholder. Configurable icon, title, description, and optional call-to-action.",
    capabilities: ["ui.emptystate"]
  },
  {
    id:          "ScrollMap.prim",
    name:        "ScrollMap",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/ScrollMap/ScrollMap.prim.js",
    css:         "ui/primitives/ScrollMap/ScrollMap.prim.css",
    css_class:   "sdoa-scroll-map",
    description: "Scrollable container with minimap navigator. Shows current viewport position within total content.",
    capabilities: ["ui.scrollmap"]
  },
  {
    id:          "CodeEditor.prim",
    name:        "CodeEditor",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/CodeEditor/CodeEditor.prim.js",
    css:         "ui/primitives/CodeEditor/CodeEditor.prim.css",
    css_class:   "sdoa-code-editor",
    description: "Syntax-highlighted code editing surface. Configurable language, theme, and change handler.",
    capabilities: ["ui.codeeditor"]
  },
  {
    id:          "ContextMenu.prim",
    name:        "ContextMenu",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/ContextMenu/ContextMenu.prim.js",
    css:         "ui/primitives/ContextMenu/ContextMenu.prim.css",
    css_class:   "sdoa-context-menu",
    description: "Right-click context menu. Configurable menu items with nested submenus. Positions at cursor.",
    capabilities: ["ui.contextmenu"]
  },
  {
    id:          "Spinner.prim",
    name:        "Spinner",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Spinner/Spinner.prim.js",
    css:         "ui/primitives/Spinner/Spinner.prim.css",
    css_class:   "sdoa-spinner",
    description: "Loading indicator animation. Configurable size and optional label.",
    capabilities: ["ui.spinner"]
  },
  {
    id:          "Markdown.prim",
    name:        "Markdown",
    type:        "primitive",
    layer:       2,
    file:        "ui/primitives/Markdown/Markdown.prim.js",
    css:         "ui/primitives/Markdown/Markdown.prim.css",
    css_class:   "sdoa-markdown",
    description: "Markdown-to-HTML renderer with sanitization. Configurable content and optional streaming mode for real-time append.",
    capabilities: ["ui.markdown"],
    exemplar_note: "See exemplars/Markdown.prim.js for the canonical implementation pattern (IIFE-wrapped, const MANIFEST, window.ModuleLoader.register)."
  }
];

// ─── Primitive Rules ──────────────────────────────────────────────────────────
const PRIMITIVE_RULES = [
  "There are exactly 19 canonical UI primitives. Every UI feature must compose from these atoms.",
  "No bespoke one-off components. If a component doesn't map to one of these 19, it is a new primitive candidate that requires governance review before creation.",
  "Each primitive is a sovereign with its own folder, CSS, and manifest.",
  "Primitives are domain-agnostic — they take configuration, not application data.",
  "All primitive CSS classes use the 'sdoa-{primitive-name}' naming convention.",
  "Primitives must be IIFE-wrapped (non-TypeScript) and use 'const MANIFEST' (not 'static MANIFEST').",
  "Primitives must NOT call fetch() or make backend calls.",
  "Primitives must call window.ModuleLoader.register() to register themselves."
];

module.exports = { PRIMITIVE_REGISTRY, PRIMITIVE_RULES };
