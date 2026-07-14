// SDOA v1.2 compliant — Fast UI Component
// Last modified: 2026-07-13T00:00:00Z
import { invoke } from "@tauri-apps/api/tauri";
import { useState } from "react";

const MANIFEST = {
    id:      "PaletteInput.prim",
    type:    "primitive",
    layer:   2,
    runtime: "Browser",
    version: "1.0.1",
    requires: ["QmdAdapter.ui"],
    dependencies: ["QmdAdapter.ui"],
    capabilities: [
        "palette:input:render",
        "palette:input:search"
    ],
    docs: {
        description: "Fast React input primitive for the Command Palette; debounced-by-length search box that routes queries through the sdoa_route Tauri command to QmdAdapter for project/file search results.",
        author: "ProtoAI Team"
    },
    last_modified: "2026-07-13T00:00:00Z"
};

export const PaletteInput = () => {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);

    const handleSearch = async (val: string) => {
        setQuery(val);
        if (val.length > 2) {
            // SDOA Routing: Search -> QmdAdapter -> VSearch
            const data = await invoke("sdoa_route", {
                target: "QmdAdapter",
                method: "search",
                args: { query: val }
            });
            setResults(data);
        }
    };

    return (
        <div className="command-palette">
            <input
                autoFocus
                placeholder="Search project or ask SDOA..."
                onChange={(e) => handleSearch(e.target.value)}
            />
            <div className="results-list">
                {results.map(res => (
                    <div key={res.id} className="result-item">
                        <span>{res.file}</span>
                        <small>{res.snippet_preview}</small>
                    </div>
                ))}
            </div>
        </div>
    );
};
