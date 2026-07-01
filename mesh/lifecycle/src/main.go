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
		"authority": "Lifecycle",
		"role":      "Mesh Sleeve Lifecycle Manager",
	})
}

func main() {
	port := os.Getenv("LIFECYCLE_PORT")
	if port == "" {
		port = "3020"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/lifecycle/spawn", handleSpawn)
	http.HandleFunc("/lifecycle/retire", handleRetire)
	http.HandleFunc("/lifecycle/rotate", handleRotate)
	http.HandleFunc("/lifecycle/failover", handleFailover)

	fmt.Printf("[Lifecycle] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
