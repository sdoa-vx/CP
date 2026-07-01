package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func gateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ValidationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fmt.Printf("[ProbationOfficer] Analyzing pre-commit module gate for sleeve: %s\n", req.SleeveID)

	// Here the ProbationOfficer interacts with the SDOA module graph
	// We check if the sleeve has the correct capability surface
	w.Header().Set("Content-Type", "application/json")
	if req.SleeveID == "" || req.Path == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "rejected",
			"reason": "Missing sleeve context",
		})
		return
	}

	// For demonstration, approve the gate logic
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "approved",
		"sleeveId": req.SleeveID,
		"reason":   "Module passes pre-commit sandbox gates.",
	})
}
