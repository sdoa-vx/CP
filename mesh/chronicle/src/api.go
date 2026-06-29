package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

var ingestCh chan<- Event

func initChronicleAPI(events chan<- Event) {
	ingestCh = events
	http.HandleFunc("/chronicle/ingest", ingestHandler)
	http.HandleFunc("/chronicle/stream", streamEventsHandler)
	http.HandleFunc("/chronicle/windows/", getWindowsHandler)
	http.HandleFunc("/chronicle/replay", replayHandler)
}

func ingestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var evt Event
	if err := json.NewDecoder(r.Body).Decode(&evt); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	if ingestCh != nil {
		ingestCh <- evt
	}
	w.WriteHeader(http.StatusAccepted)
}

func streamEventsHandler(w http.ResponseWriter, r *http.Request) {
	// SSE/WebSocket stream of live events.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// TODO: implement full fan-out pub/sub for SSE stream
	fmt.Fprintf(w, "data: {\"info\": \"stream connected\"}\n\n")
}

func getWindowsHandler(w http.ResponseWriter, r *http.Request) {
	sleeveID := strings.TrimPrefix(r.URL.Path, "/chronicle/windows/")
	if sleeveID == "" {
		http.Error(w, "sleeveID required", http.StatusBadRequest)
		return
	}

	windowsMutex.RLock()
	slices := sleeveWindows[sleeveID]
	windowsMutex.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if slices == nil {
		json.NewEncoder(w).Encode([]WindowSlice{})
		return
	}
	json.NewEncoder(w).Encode(slices)
}

func replayHandler(w http.ResponseWriter, r *http.Request) {
	// Accept a ReplayRequest and stream events back.
}
