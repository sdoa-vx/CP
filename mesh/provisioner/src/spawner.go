package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
)

func spawnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ProvisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fmt.Printf("[Provisioner] Spawning sleeve %s (Runtime: %s)\n", req.SleeveID, req.Runtime)

	var cmd *exec.Cmd
	switch req.Runtime {
	case "go":
		cmd = exec.Command(req.Path)
	case "python":
		cmd = exec.Command("python", req.Path)
	case "rust":
		cmd = exec.Command(req.Path)
	case "wasm":
		cmd = exec.Command("wasmtime", req.Path)
	default:
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "rejected",
			"error":  "Unsupported runtime for spawning",
		})
		return
	}

	// In a real implementation we would start the command and track its PID
	_ = cmd

	// Automatically register with Registrar
	registerSleeve(req.SleeveID, req.Runtime)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "success",
		"sleeveId": req.SleeveID,
		"message":  fmt.Sprintf("Sleeve spawned successfully in %s runtime", req.Runtime),
	})
}

func retireHandler(w http.ResponseWriter, r *http.Request) {
	// Logic to gracefully terminate and deregister a sleeve
	var req ProvisionRequest
	json.NewDecoder(r.Body).Decode(&req)
	fmt.Printf("[Provisioner] Retiring sleeve %s\n", req.SleeveID)
	json.NewEncoder(w).Encode(map[string]string{"status": "retired"})
}
