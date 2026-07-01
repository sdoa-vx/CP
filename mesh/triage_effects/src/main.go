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
		"authority": "TriageEffects",
		"role":      "Mesh Effects Application Engine",
	})
}

func main() {
	port := os.Getenv("TRIAGE_EFFECTS_PORT")
	if port == "" {
		port = "3023"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/effects/apply", handleApplyEffects)

	fmt.Printf("[TriageEffects] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
