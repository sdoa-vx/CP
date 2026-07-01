package main

import "net/http"

func main() {
	// Initialize Pulse scoring daemon
	startScoringLoop()
	startDriftLoop()

	// Initialize API
	initPulseAPI()
	go http.ListenAndServe("127.0.0.1:8082", nil)

	// Keep daemon alive
	select {}
}
