package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Event struct {
	ModuleID  string         `json:"module_id"`
	EventType string         `json:"event_type"`
	Timestamp time.Time      `json:"timestamp"`
	Payload   map[string]any `json:"payload"`
}

func main() {
	fmt.Println("[MockEmitter] Igniting the Sovereign Loop...")

	events := []Event{
		{
			ModuleID:  "assemblyline-01",
			EventType: "scan:start",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"totalFiles": 1500,
			},
		},
		{
			ModuleID:  "builder-01",
			EventType: "proposal:created",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"proposal_id": "prop-alpha-99",
				"description": "Optimize V8 bindings",
			},
		},
		{
			ModuleID:  "arbitration-01",
			EventType: "governance:approved",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"proposal_id": "prop-alpha-99",
				"votes": 5,
			},
		},
		{
			ModuleID:  "assemblyline-01",
			EventType: "build:complete",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"artifact": "v8-binding.wasm",
			},
		},
		{
			ModuleID:  "provisioner-01",
			EventType: "sleeve:spawned",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"sleeve_id": "sleeve-rust-01",
			},
		},
		{
			ModuleID:  "triage-01",
			EventType: "triage:routingCascade",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"target_sleeve": "sleeve-rust-01",
				"latency_ms": 12,
			},
		},
		{
			ModuleID:  "cartographer-01",
			EventType: "driftTrend",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"sleeve_id": "sleeve-rust-01",
				"drift_slope": 0.02,
				"volatility": 0.5,
			},
		},
		{
			ModuleID:  "arbitration-01",
			EventType: "transportNegotiated",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"transport": "ipc",
			},
		},
		{
			ModuleID:  "batch-01",
			EventType: "batchExecuted",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"batch_size": 1000,
				"success_rate": 0.999,
				"error_rate": 0.001,
				"latency": 45,
			},
		},
		{
			ModuleID:  "timemachine-01",
			EventType: "timemachine:rewind",
			Timestamp: time.Now(),
			Payload: map[string]any{
				"target_timestamp": time.Now().Add(-24 * time.Hour),
			},
		},
	}

	for _, evt := range events {
		jsonData, _ := json.Marshal(evt)
		resp, err := http.Post("http://localhost:8081/chronicle/ingest", "application/json", bytes.NewBuffer(jsonData))
		if err != nil {
			fmt.Printf("[MockEmitter] Failed to send event %s: %v\n", evt.EventType, err)
		} else {
			fmt.Printf("[MockEmitter] Fired %s -> Chronicle (Status: %s)\n", evt.EventType, resp.Status)
			resp.Body.Close()
		}
		time.Sleep(500 * time.Millisecond)
	}

	fmt.Println("[MockEmitter] Activation sequence completed.")
}
