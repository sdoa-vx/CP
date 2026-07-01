package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func orchestrateBuild(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var output []byte
	var err error

	// Concurrency and load balancing logic would wrap these calls in a production implementation
	switch req.Runtime {
	case "rust":
		output, err = executeRustLane(req.Path)
	case "go":
		output, err = executeGoLane(req.Path, req.Target)
	case "python":
		output, err = executePythonLane(req.Path)
	case "c++":
		output, err = executeCppLane(req.Path, req.Target)
	case "wasm":
		output, err = executeWasmLane(req.Path)
	default:
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "rejected",
			"error":  "Unsupported runtime",
		})
		return
	}

	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "failed",
			"error":  err.Error(),
			"output": string(output),
		})
		return
	}

	fmt.Printf("[Builder] Successfully built %s target at %s\n", req.Runtime, req.Path)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"output": string(output),
	})
}
