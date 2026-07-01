package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type EffectRequest struct {
	Type     string `json:"type"` // "routing", "topology", "drift"
	Payload  string `json:"payload"`
}

func handleApplyEffects(w http.ResponseWriter, r *http.Request) {
	var req EffectRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	fmt.Printf("[TriageEffects] Applying %s effect to mesh\n", req.Type)

	json.NewEncoder(w).Encode(map[string]string{
		"status": "applied",
		"effect": req.Type,
	})
}
