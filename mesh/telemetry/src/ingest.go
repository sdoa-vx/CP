package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type TelemetryData struct {
	SleeveID string `json:"sleeveId"`
	CPU      int    `json:"cpu"`
	Memory   int    `json:"memory"`
}

type IngestRequest struct {
	Batch []TelemetryData `json:"batch"`
}

func handleIngest(w http.ResponseWriter, r *http.Request) {
	var req IngestRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	fmt.Printf("[TelemetryEngine] Ingested telemetry batch of size %d\n", len(req.Batch))
	
	// Normally this data is piped directly to Pulse for normalization
	// and into Chronicle for long-term storage

	json.NewEncoder(w).Encode(map[string]string{
		"status": "ingested",
		"message": "Telemetry successfully normalized for Pulse.",
	})
}
