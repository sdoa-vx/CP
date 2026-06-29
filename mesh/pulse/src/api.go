package main

import "net/http"

func initPulseAPI() {
	http.HandleFunc("/pulse/scores", getScoresHandler)
	http.HandleFunc("/pulse/mesh", getMeshHandler)
	http.HandleFunc("/pulse/drift", getDriftHandler)
	http.HandleFunc("/pulse/transports", getTransportsHandler)
}

func getScoresHandler(w http.ResponseWriter, r *http.Request) {
	// Return the current sleeve scores.
}

func getMeshHandler(w http.ResponseWriter, r *http.Request) {
	// Return the current routing mesh state.
}

func getDriftHandler(w http.ResponseWriter, r *http.Request) {
	// Return drift penalties + DEGRADING states.
}

func getTransportsHandler(w http.ResponseWriter, r *http.Request) {
	// Return transport scores.
}
