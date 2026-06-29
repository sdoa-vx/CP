package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

var exportCursor int = 0

type SupabaseMeshEvent struct {
	ModuleID  string         `json:"module_id"`
	EventType string         `json:"event_type"`
	Payload   map[string]any `json:"payload"`
	CreatedAt string         `json:"created_at"`
}

func startExporterLoop() {
	ticker := time.NewTicker(2 * time.Second)
	go func() {
		for range ticker.C {
			exportBatch()
		}
	}()
}

func exportBatch() {
	eventStoreMutex.Lock()
	if exportCursor >= len(eventStore) {
		eventStoreMutex.Unlock()
		return
	}
	
	batch := eventStore[exportCursor:]
	exportCursor = len(eventStore)
	eventStoreMutex.Unlock()

	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")
	
	if supabaseURL == "" || supabaseKey == "" {
		fmt.Println("[Chronicle Exporter] SUPABASE_URL or SUPABASE_KEY missing. Skipping export.")
		return
	}
    
	var payload []SupabaseMeshEvent
	for _, e := range batch {
		payload = append(payload, SupabaseMeshEvent{
			ModuleID:  e.ModuleID,
			EventType: e.EventType,
			Payload:   e.Payload,
			CreatedAt: e.Timestamp.Format(time.RFC3339),
		})
	}
	
	data, err := json.Marshal(payload)
	if err != nil {
		fmt.Printf("[Chronicle Exporter] error marshaling: %v\n", err)
		return
	}

	req, err := http.NewRequest("POST", fmt.Sprintf("%s/rest/v1/chronicle_events", supabaseURL), bytes.NewBuffer(data))
	if err != nil {
		fmt.Printf("[Chronicle Exporter] error creating request: %v\n", err)
		return
	}
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Authorization", "Bearer "+supabaseKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[Chronicle Exporter] error sending: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		fmt.Printf("[Chronicle Exporter] Supabase returned status %d\n", resp.StatusCode)
	} else {
		fmt.Printf("[Chronicle Exporter] Exported %d events to Supabase\n", len(batch))
	}
}
