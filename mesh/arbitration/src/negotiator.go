package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type NegotiationRequest struct {
	SleeveID   string `json:"sleeveId"`
	TargetNode string `json:"targetNode"`
	PayloadSize int   `json:"payloadSize"`
}

func handleNegotiation(w http.ResponseWriter, r *http.Request) {
	var req NegotiationRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	fmt.Printf("[Arbitrator] Negotiating transport for Sleeve %s -> %s\n", req.SleeveID, req.TargetNode)

	transport := "HTTP"
	if req.PayloadSize > 1024*1024 {
		transport = "IPC"
	} else if req.PayloadSize > 1024*100 {
		transport = "TCP"
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status": "negotiated",
		"transport": transport,
	})
}
