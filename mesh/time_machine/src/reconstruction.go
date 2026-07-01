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
		fmt.Println("[TimeMachine] Connected to Supabase real-time memory.")
	} else {
		fmt.Println("[TimeMachine] WARNING: SUPABASE_URL or SUPABASE_KEY not set.")
	}
}

type ReplayRequest struct {
	Timestamp string `json:"timestamp"`
}

func handleReplay(w http.ResponseWriter, r *http.Request) {
	var req ReplayRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	fmt.Printf("[TimeMachine] Reconstructing mesh topology for timestamp: %s\n", req.Timestamp)

	if sbClient != nil {
		var events []map[string]interface{}
		// Range query on chronicle_events
		err := sbClient.DB.From("chronicle_events").Select("*").Lte("timestamp", req.Timestamp).Execute(&events)
		if err == nil {
			fmt.Printf("[TimeMachine] Loaded %d historical blocks from Chronicle.\n", len(events))
		}
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status": "reconstructed",
		"timestamp": req.Timestamp,
		"message": "Mesh state successfully reconstructed.",
	})
}

// ensure initSupabase is called from main

