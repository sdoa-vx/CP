package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
)

var forbiddenSyscalls = []string{
	"execve", "fork", "socket", "connect", "bind", "ptrace",
}

func sandboxHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ValidationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fmt.Printf("[ProbationOfficer] Analyzing sandbox limits for %s at %s\n", req.Runtime, req.Path)

	content, err := os.ReadFile(req.Path)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "failed",
			"error":  "Failed to read file for sandboxing",
		})
		return
	}
	code := string(content)

	// Memory boundary enforcement & line limits
	lines := strings.Split(code, "\n")
	if len(lines) > 500 {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "rejected",
			"reason":   "Line limit exceeded (Max 500)",
			"severity": "high",
		})
		return
	}

	// Forbidden action detection
	for _, syscall := range forbiddenSyscalls {
		matched, _ := regexp.MatchString(`\b`+syscall+`\b`, code)
		if matched {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status":   "rejected",
				"reason":   fmt.Sprintf("Forbidden syscall detected: %s", syscall),
				"severity": "critical",
			})
			return
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "approved",
		"reason": "Sandbox analysis passed.",
	})
}
