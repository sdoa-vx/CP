package main

import (
	"sync"
	"time"
)

type WindowSlice struct {
	Start  time.Time
	End    time.Time
	Events []Event
}

var (
	windowsMutex sync.RWMutex
	sleeveWindows = make(map[string][]WindowSlice)
)

func startWindowRoller() {
	ticker := time.NewTicker(5 * time.Second)
	go func() {
		for range ticker.C {
			rollWindows()
		}
	}()
}

func rollWindows() {
	now := time.Now()
	start := now.Add(-5 * time.Second)

	eventStoreMutex.Lock()
	eventsToProcess := eventStore
	eventStore = []Event{} // Clear the store for the next window
	eventStoreMutex.Unlock()

	// Group events by ModuleID
	grouped := make(map[string][]Event)
	for _, evt := range eventsToProcess {
		// ModuleID could be a sleeve or the engine core itself
		id := evt.ModuleID
		if id == "" {
			id = "unknown"
		}
		grouped[id] = append(grouped[id], evt)
	}

	windowsMutex.Lock()
	defer windowsMutex.Unlock()
	
	// Create a slice for every tracked module, even if it had 0 events this window
	// to ensure downstream sees empty windows and can calculate decay correctly.
	for id, evts := range grouped {
		slice := WindowSlice{
			Start:  start,
			End:    now,
			Events: evts,
		}
		sleeveWindows[id] = append(sleeveWindows[id], slice)
		// Keep last 12 slices (60 seconds)
		if len(sleeveWindows[id]) > 12 {
			sleeveWindows[id] = sleeveWindows[id][1:]
		}
	}
}
