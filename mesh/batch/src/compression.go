package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func handleCompression(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	fmt.Printf("[BatchEngine] Compressing payload of size %d bytes\n", len(body))

	var b bytes.Buffer
	gz := gzip.NewWriter(&b)
	if _, err := gz.Write(body); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	gz.Close()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "compressed",
		"original_size": len(body),
		"compressed_size": b.Len(),
	})
}
