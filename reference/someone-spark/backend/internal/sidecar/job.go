package sidecar

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type RunCfg struct {
	Bin     string
	Script  string
	Root    string
	Env     []string
	Timeout time.Duration
	OnStart func(pid int)
}

func guardPython(rc RunCfg) error {
	if strings.TrimSpace(rc.Bin) != "" {
		return nil
	}
	if err := PythonReady(); err != nil {
		return err
	}
	return ErrPythonMissing
}

func RunLines(ctx context.Context, rc RunCfg, payload any, onLine func([]byte) error) error {
	if err := guardPython(rc); err != nil {
		return err
	}
	if rc.Timeout <= 0 {
		rc.Timeout = 90 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, rc.Timeout)
	defer cancel()
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	cmd := exec.Command(rc.Bin, rc.Script, "job")
	cmd.Dir = rc.Root
	cmd.Env = applySidecarEnv(rc.Root, rc.Env)
	cmd.Stdin = bytes.NewReader(b)
	prepProcessGroup(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	errPipe, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
		if rc.OnStart != nil {
			rc.OnStart(pid)
		}
	}
	var exited int32
	go func() {
		<-ctx.Done()
		if atomic.LoadInt32(&exited) == 1 {
			return
		}
		if pid > 0 {
			KillTree(pid)
		}
	}()
	var stderr bytes.Buffer
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(errPipe)
		buf := make([]byte, 0, 16*1024)
		sc.Buffer(buf, 512*1024)
		for sc.Scan() {
			line := sc.Text()
			if line == "" {
				continue
			}
			slog.Info("sidecar stderr", "pid", pid, "line", line)
			stderr.WriteString(line)
			stderr.WriteByte('\n')
		}
	}()
	sc := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 2*1024*1024)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		if err := onLine(append([]byte(nil), line...)); err != nil {
			KillTree(pid)
			atomic.StoreInt32(&exited, 1)
			wg.Wait()
			return err
		}
	}
	waitErr := cmd.Wait()
	atomic.StoreInt32(&exited, 1)
	wg.Wait()
	if waitErr != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("%w: %v: %s", ctx.Err(), waitErr, stderr.String())
		}
		return fmt.Errorf("%v: %s", waitErr, stderr.String())
	}
	return sc.Err()
}

func RunJSON(ctx context.Context, rc RunCfg, payload any) (map[string]any, error) {
	if err := guardPython(rc); err != nil {
		return nil, err
	}
	if rc.Timeout <= 0 {
		rc.Timeout = 40 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, rc.Timeout)
	defer cancel()
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, rc.Bin, rc.Script, "job")
	cmd.Dir = rc.Root
	cmd.Env = applySidecarEnv(rc.Root, rc.Env)
	cmd.Stdin = bytes.NewReader(b)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%v: %s", err, stderr.String())
	}
	var m map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &m); err != nil {
		return nil, fmt.Errorf("解析 sidecar JSON: %w (%s)", err, stdout.String())
	}
	return m, nil
}
