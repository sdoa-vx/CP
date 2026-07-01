package main

import (
	"fmt"
)

func registerSleeve(sleeveID, runtime string) {
	// In reality this would make an HTTP POST to the Registrar daemon
	fmt.Printf("[Provisioner] Sleeve %s successfully registered with Registrar.\n", sleeveID)
}
