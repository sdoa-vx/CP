package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "online",
		"authority": "TelemetryEngine",
		"role":      "Sleeve Telemetry Ingestion Engine",
	})
}

func main() {
	port := os.Getenv("TELEMETRY_PORT")
	if port == "" {
		port = "3026"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/telemetry/ingest", handleIngest)

	fmt.Printf("[TelemetryEngine] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
