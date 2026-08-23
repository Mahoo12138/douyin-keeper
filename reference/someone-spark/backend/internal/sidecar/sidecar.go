package sidecar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"huohua/internal/config"
)

type Info struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	OK      bool   `json:"ok"`
}

func Ping(cfg *config.Config) (py, node Info, err error) {
	if strings.TrimSpace(cfg.SidecarPy) == "" {
		return py, node, fmt.Errorf("python sidecar: %w", ErrPythonMissing)
	}
	py, err = runJSON(cfg, cfg.SidecarPy, cfg.SidecarPyScript, "version")
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return py, node, fmt.Errorf("python sidecar: %w", ErrPythonMissing)
		}
		return py, node, fmt.Errorf("python sidecar: %w", err)
	}
	node, err = runJSON(cfg, cfg.SidecarNode, cfg.SidecarNodeScript, "version")
	if err != nil {
		return py, node, fmt.Errorf("node sidecar: %w", err)
	}
	return py, node, nil
}

func runJSON(cfg *config.Config, bin, script, arg string) (Info, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, script, arg)
	cmd.Dir = cfg.Root
	cmd.Env = applySidecarEnv(cfg.Root, nil)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return Info{}, fmt.Errorf("%w: %s", err, stderr.String())
	}
	var info Info
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &info); err != nil {
		return Info{}, fmt.Errorf("解析 sidecar JSON: %w (%s)", err, stdout.String())
	}
	return info, nil
}
