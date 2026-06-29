package main

import (
	"sync"
	"time"
)

type Event struct {
	ModuleID  string         // sleeve or engine
	EventType string         // boundaryCall, boundaryFault, transportNegotiated, etc.
	Timestamp time.Time
	Payload   map[string]any // flexible, JSON-like
}

var (
	eventStoreMutex sync.Mutex
	eventStore      []Event
)

func startIngestLoop(events <-chan Event) {
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
}
