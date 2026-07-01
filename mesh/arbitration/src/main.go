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
		"authority": "Arbitrator",
		"role":      "Transport Arbitration Engine",
	})
}

func main() {
	port := os.Getenv("ARBITRATOR_PORT")
	if port == "" {
		port = "3021"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/transport/negotiate", handleNegotiation)
	http.HandleFunc("/transport/score", handleScoring)

	fmt.Printf("[Arbitrator] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
