package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type ScoreRequest struct {
	SleeveID string  `json:"sleeveId"`
	Latency  float64 `json:"latency"`
	Drift    float64 `json:"drift"`
}

func handleScoring(w http.ResponseWriter, r *http.Request) {
	var req ScoreRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	penalty := req.Latency * req.Drift
	fmt.Printf("[Arbitrator] Sleeve %s scored with penalty: %f\n", req.SleeveID, penalty)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "scored",
		"penalty": penalty,
	})
}
