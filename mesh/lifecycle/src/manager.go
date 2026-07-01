package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type LifecycleAction struct {
	SleeveID string `json:"sleeveId"`
	Reason   string `json:"reason,omitempty"`
}

func handleSpawn(w http.ResponseWriter, r *http.Request) {
	var action LifecycleAction
	json.NewDecoder(r.Body).Decode(&action)
	fmt.Printf("[Lifecycle] Emitting spawn signal for sleeve: %s\n", action.SleeveID)
	// In production, interacts with Provisioner
	json.NewEncoder(w).Encode(map[string]string{"status": "spawning", "sleeveId": action.SleeveID})
}

func handleRetire(w http.ResponseWriter, r *http.Request) {
	var action LifecycleAction
	json.NewDecoder(r.Body).Decode(&action)
	fmt.Printf("[Lifecycle] Emitting retire signal for sleeve: %s\n", action.SleeveID)
	json.NewEncoder(w).Encode(map[string]string{"status": "retiring", "sleeveId": action.SleeveID})
}

func handleRotate(w http.ResponseWriter, r *http.Request) {
	var action LifecycleAction
	json.NewDecoder(r.Body).Decode(&action)
	fmt.Printf("[Lifecycle] Rotating sleeve: %s (Reason: %s)\n", action.SleeveID, action.Reason)
	json.NewEncoder(w).Encode(map[string]string{"status": "rotated", "sleeveId": action.SleeveID})
}

func handleFailover(w http.ResponseWriter, r *http.Request) {
	var action LifecycleAction
	json.NewDecoder(r.Body).Decode(&action)
	fmt.Printf("[Lifecycle] Initiating failover for sleeve: %s\n", action.SleeveID)
	json.NewEncoder(w).Encode(map[string]string{"status": "failover_initiated", "sleeveId": action.SleeveID})
}
