package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	supabase "github.com/nedpals/supabase-go"
)

var sbClient *supabase.Client

func initSupabase() {
	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")
	if supabaseURL != "" && supabaseKey != "" {
		sbClient = supabase.CreateClient(supabaseURL, supabaseKey)
		fmt.Println("[Pulse] Connected to Supabase real-time brain.")
	} else {
		fmt.Println("[Pulse] WARNING: SUPABASE_URL or SUPABASE_KEY not set.")
	}
}

func initPulseAPI() {
	initSupabase()
	http.HandleFunc("/pulse/scores", getScoresHandler)
	http.HandleFunc("/pulse/mesh", getMeshHandler)
	http.HandleFunc("/pulse/drift", getDriftHandler)
	http.HandleFunc("/pulse/transports", getTransportsHandler)
	http.HandleFunc("/pulse/evaluate", evaluateHandler)
}

type EvalRequest struct {
	ModuleID  string         `json:"module_id"`
	EventType string         `json:"event_type"`
	Payload   map[string]any `json:"payload"`
}

func evaluateHandler(w http.ResponseWriter, r *http.Request) {
	var req EvalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	fmt.Printf("[Pulse] Evaluating telemetry from %s: %s\n", req.ModuleID, req.EventType)
	
	// Mock extraction of metrics from payload
	latency := 50.0
	if l, ok := req.Payload["latency"].(float64); ok {
		latency = l
	}
	errRate := 0.01
	if e, ok := req.Payload["error_rate"].(float64); ok {
		errRate = e
	}
	successRate := 0.99
	if s, ok := req.Payload["success_rate"].(float64); ok {
		successRate = s
	}

	score := computePulseScore(req.ModuleID, latency, errRate, successRate, 0.0, 0.0, 1.0, 1.0, latency)
	
	json.NewEncoder(w).Encode(score)
}

func getScoresHandler(w http.ResponseWriter, r *http.Request) {
	// Return the current sleeve scores.
	if sbClient != nil {
		var scores []map[string]interface{}
		err := sbClient.DB.From("pulse_scores").Select("*").Execute(&scores)
		if err == nil {
			json.NewEncoder(w).Encode(scores)
			return
		}
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "fallback_scores"})
}

func getMeshHandler(w http.ResponseWriter, r *http.Request) {
	// Return the current routing mesh state.
	json.NewEncoder(w).Encode(map[string]string{"status": "mesh_state"})
}

func getDriftHandler(w http.ResponseWriter, r *http.Request) {
	// Return drift penalties + DEGRADING states.
	json.NewEncoder(w).Encode(map[string]string{"status": "drift_state"})
}

func getTransportsHandler(w http.ResponseWriter, r *http.Request) {
	// Return transport scores.
	json.NewEncoder(w).Encode(map[string]string{"status": "transport_scores"})
}
