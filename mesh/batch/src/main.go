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
		"authority": "BatchEngine",
		"role":      "Batch Execution & Compression Engine",
	})
}

func main() {
	port := os.Getenv("BATCH_PORT")
	if port == "" {
		port = "3022"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/batch/execute", handleExecution)
	http.HandleFunc("/batch/compress", handleCompression)

	fmt.Printf("[BatchEngine] Sovereign authority online at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
