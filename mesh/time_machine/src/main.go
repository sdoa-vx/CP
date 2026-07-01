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
		"authority": "TimeMachine",
		"role":      "Mesh Time Machine Reconstruction Engine",
	})
}

func main() {
	initSupabase()
	port := os.Getenv("TIME_MACHINE_PORT")
	if port == "" {
		port = "3025"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/time/replay", handleReplay)

	fmt.Printf("[TimeMachine] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
