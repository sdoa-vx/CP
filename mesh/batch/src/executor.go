package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

type BatchItem struct {
	ID      string `json:"id"`
	Payload string `json:"payload"`
}

type BatchRequest struct {
	Items []BatchItem `json:"items"`
}

func handleExecution(w http.ResponseWriter, r *http.Request) {
	var req BatchRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	fmt.Printf("[BatchEngine] Executing batch of %d items\n", len(req.Items))

	var wg sync.WaitGroup
	for _, item := range req.Items {
		wg.Add(1)
		go func(it BatchItem) {
			defer wg.Done()
			// Simulate execution
			fmt.Printf("  -> Executed item %s\n", it.ID)
		}(item)
	}

	wg.Wait()

	json.NewEncoder(w).Encode(map[string]string{
		"status": "completed",
	})
}
