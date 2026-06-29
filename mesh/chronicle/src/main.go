package main

import "net/http"

func main() {
	// Initialize Chronicle ingestion daemon
	events := make(chan Event, 1000)
	replayReqs := make(chan ReplayRequest, 100)

	// Start the Chronicle spine
	startIngestLoop(events)
	startWindowRoller()
	startReplayServer(replayReqs)
	startExporterLoop()

	// Initialize API
	initChronicleAPI(events)
	go http.ListenAndServe(":8081", nil)

	// Keep daemon alive
	select {}
}
