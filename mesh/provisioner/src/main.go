package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

type ProvisionRequest struct {
	SleeveID string `json:"sleeveId"`
	Runtime  string `json:"runtime"`
	Path     string `json:"path"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "online",
		"authority": "Provisioner",
		"role":      "Polyglot Sleeve Provisioning Engine",
	})
}

func main() {
	port := os.Getenv("PROVISIONER_PORT")
	if port == "" {
		port = "3018"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/spawn", spawnHandler)
	http.HandleFunc("/retire", retireHandler)

	fmt.Printf("[Provisioner] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
