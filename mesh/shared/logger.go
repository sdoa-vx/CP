package shared

import (
	"fmt"
	"log"
	"os"
	"time"

	supabase "github.com/nedpals/supabase-go"
)

type MeshLogEntry struct {
	Authority string    `json:"authority"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

var sbClient *supabase.Client
var authorityName string

func InitLogger(authority string) {
	authorityName = authority
	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")
	if supabaseURL != "" && supabaseKey != "" {
		sbClient = supabase.CreateClient(supabaseURL, supabaseKey)
		fmt.Printf("[%s Logger] Connected to mesh_logs in Supabase\n", authorityName)
	} else {
		fmt.Printf("[%s Logger] WARNING: No Supabase keys. Logging to stdout only.\n", authorityName)
	}
}

func Log(level, message string) {
	fmt.Printf("[%s] %s: %s\n", authorityName, level, message)
	
	if sbClient != nil {
		entry := MeshLogEntry{
			Authority: authorityName,
			Level:     level,
			Message:   message,
			Timestamp: time.Now(),
		}
		var results []MeshLogEntry
		err := sbClient.DB.From("mesh_logs").Insert(entry).Execute(&results)
		if err != nil {
			log.Printf("[Logger Error] Failed to write to mesh_logs: %v\n", err)
		}
	}
}

func Info(format string, a ...interface{}) {
	Log("INFO", fmt.Sprintf(format, a...))
}

func Warn(format string, a ...interface{}) {
	Log("WARN", fmt.Sprintf(format, a...))
}

func Error(format string, a ...interface{}) {
	Log("ERROR", fmt.Sprintf(format, a...))
}
