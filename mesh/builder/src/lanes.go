package main

import (
	"fmt"
	"os/exec"
)

func executeRustLane(path string) ([]byte, error) {
	fmt.Printf("[Builder] Entering Rust Build Lane for %s\n", path)
	cmd := exec.Command("cargo", "build", "--release")
	cmd.Dir = path
	return cmd.CombinedOutput()
}

func executeGoLane(path, target string) ([]byte, error) {
	fmt.Printf("[Builder] Entering Go Build Lane for %s\n", path)
	cmd := exec.Command("go", "build", "-o", target)
	cmd.Dir = path
	return cmd.CombinedOutput()
}

func executePythonLane(path string) ([]byte, error) {
	fmt.Printf("[Builder] Entering Python Build Lane for %s\n", path)
	cmd := exec.Command("python", "-m", "compileall", ".")
	cmd.Dir = path
	return cmd.CombinedOutput()
}

func executeCppLane(path, target string) ([]byte, error) {
	fmt.Printf("[Builder] Entering C++ Build Lane for %s\n", path)
	cmd := exec.Command("make", target)
	cmd.Dir = path
	return cmd.CombinedOutput()
}

func executeWasmLane(path string) ([]byte, error) {
	fmt.Printf("[Builder] Entering Wasm Build Lane for %s\n", path)
	cmd := exec.Command("wasm-pack", "build", "--target", "web")
	cmd.Dir = path
	return cmd.CombinedOutput()
}
