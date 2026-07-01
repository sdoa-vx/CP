package main

import (
	"fmt"
	"log"
	"time"
)

type ScoreComponents struct {
	BaseScore   float64 `json:"base_score"`
	Drift       float64 `json:"drift_penalty"`
	Transport   float64 `json:"transport_modifier"`
	Batch       float64 `json:"batch_bonus"`
}

type PulseScore struct {
	SleeveID   string          `json:"sleeve_id"`
	FinalScore float64         `json:"final_score"`
	Components ScoreComponents `json:"components"`
	Timestamp  time.Time       `json:"timestamp"`
}

func startScoringLoop() {
	// In the real system, this pulls from Supabase/Chronicle.
	// For now, it's driven by HTTP evaluation.
	fmt.Println("[Pulse] Scoring loop initialized (Event-driven via /pulse/evaluate)")
}

func computePulseScore(sleeveID string, latency, errRate, successRate, driftSlope, volatility, historicalStability, compressionRatio, batchLatency float64) PulseScore {
	// Base Score: S_base = f(latency, errorRate, successRate)
	baseScore := (successRate * 100) - (latency * 0.1) - (errRate * 50)

	// Drift penalty: P_drift = g(driftSlope, volatility)
	driftPenalty := (driftSlope * 10) + (volatility * 5)

	// Transport modifier: M_transport = h(currentTransport, historicalStability)
	transportModifier := historicalStability * 2.5

	// Batch efficiency bonus: B_batch = k(compressionRatio, batchLatency)
	batchBonus := (compressionRatio * 5) - (batchLatency * 0.05)

	finalScore := baseScore - driftPenalty + transportModifier + batchBonus

	score := PulseScore{
		SleeveID:   sleeveID,
		FinalScore: finalScore,
		Components: ScoreComponents{
			BaseScore: baseScore,
			Drift:     driftPenalty,
			Transport: transportModifier,
			Batch:     batchBonus,
		},
		Timestamp: time.Now(),
	}

	// Write back to Supabase
	if sbClient != nil {
		var results []PulseScore
		err := sbClient.DB.From("pulse_scores").Insert(score).Execute(&results)
		if err != nil {
			log.Printf("[Pulse] Failed to write pulse_score to Supabase: %v\n", err)
		} else {
			fmt.Printf("[Pulse] Scored sleeve %s -> %.2f\n", sleeveID, finalScore)
		}
	}

	return score
}
