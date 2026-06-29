package main

type ReplayRequest struct {
	SleeveID   string
	Limit      int
	ResponseCh chan Event
}

func startReplayServer(req <-chan ReplayRequest) {
	go func() {
		for r := range req {
			handleReplay(r)
		}
	}()
}

func handleReplay(r ReplayRequest) {
	// Provides replay queues for sandbox mode
}
