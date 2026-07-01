package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

type ValidationRequest struct {
	SleeveID string `json:"sleeveId"`
	Path     string `json:"path"`
	Runtime  string `json:"runtime"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "online",
		"authority": "ProbationOfficer",
		"role":      "Wasm Sandbox Enforcement & Pre-commit Gate",
	})
}

func main() {
	port := os.Getenv("PROBATION_PORT")
	if port == "" {
		port = "3016"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/validate", gateHandler)
	http.HandleFunc("/sandbox", sandboxHandler)

	fmt.Printf("[ProbationOfficer] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
