package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
	supabase "github.com/nedpals/supabase-go"
)

type Event struct {
	ModuleID  string         `json:"module_id"`
	EventType string         `json:"event_type"`
	Timestamp time.Time      `json:"timestamp"`
	Payload   map[string]any `json:"payload"`
}

var (
	eventStoreMutex sync.Mutex
	eventStore      []Event
	sbClient        *supabase.Client
)

func initSupabase() {
	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")
	if supabaseURL != "" && supabaseKey != "" {
		sbClient = supabase.CreateClient(supabaseURL, supabaseKey)
		fmt.Println("[Chronicle] Connected to Supabase real-time spine.")
	} else {
		fmt.Println("[Chronicle] WARNING: SUPABASE_URL or SUPABASE_KEY not set. Running in memory mode.")
	}
}

func startIngestLoop(events <-chan Event) {
	initSupabase()
	go func() {
		for evt := range events {
			ingestEvent(evt)
		}
	}()
}

func ingestEvent(evt Event) {
	eventStoreMutex.Lock()
	defer eventStoreMutex.Unlock()
	eventStore = append(eventStore, evt)

	if sbClient != nil {
		var results []Event
		err := sbClient.DB.From("chronicle_events").Insert(evt).Execute(&results)
		if err != nil {
			log.Printf("[Chronicle] Failed to write event to Supabase: %v\n", err)
		} else {
			fmt.Printf("[Chronicle] Event written to Supabase: %s from %s\n", evt.EventType, evt.ModuleID)
		}
	} else {
		fmt.Printf("[Chronicle] In-memory event: %s from %s\n", evt.EventType, evt.ModuleID)
		// Forward to Pulse for the test loop
		jsonData, _ := json.Marshal(evt)
		http.Post("http://localhost:8082/pulse/evaluate", "application/json", bytes.NewBuffer(jsonData))
	}
}
