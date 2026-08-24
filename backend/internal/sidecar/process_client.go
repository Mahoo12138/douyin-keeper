package sidecar

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// ProcessClient speaks the v1 NDJSON contract to one long-lived sidecar
// process. Calls are serialized because a response is correlated by stream
// order; the request_id is still checked to catch adapter protocol bugs.
//
// The command receives only the environment explicitly supplied by the
// caller. Session material must be passed through the request's short-lived
// session file, never through command arguments or queue payloads.
type ProcessClient struct {
	command string
	args    []string

	mu     sync.Mutex
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader *bufio.Reader
}

func NewProcessClient(command string, args ...string) *ProcessClient {
	return &ProcessClient{command: command, args: append([]string(nil), args...)}
}

func (c *ProcessClient) startLocked() error {
	if c.cmd != nil {
		return nil
	}
	if c.command == "" {
		return errors.New("sidecar: empty process command")
	}
	cmd := exec.Command(c.command, c.args...)
	cmd.Stderr = os.Stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("sidecar: open stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return fmt.Errorf("sidecar: open stdout: %w", err)
	}
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return fmt.Errorf("sidecar: start process: %w", err)
	}
	c.cmd, c.stdin, c.reader = cmd, stdin, bufio.NewReader(stdout)
	return nil
}

func (c *ProcessClient) stopLocked() {
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		_ = c.cmd.Wait()
	}
	c.cmd, c.stdin, c.reader = nil, nil, nil
}

type responseResult struct {
	response *Response
	err      error
}

// Call sends one request and waits for exactly one response line. A cancelled
// call terminates the process so a potentially half-written protocol stream is
// never reused for the next operation.
func (c *ProcessClient) Call(ctx context.Context, req Request) (*Response, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if req.ProtocolVersion == 0 {
		req.ProtocolVersion = ProtocolVersion
	}
	if req.ProtocolVersion != ProtocolVersion {
		return nil, fmt.Errorf("sidecar: unsupported request protocol version %d", req.ProtocolVersion)
	}
	if req.RequestID == "" {
		return nil, errors.New("sidecar: request_id is required")
	}
	if req.Op == "" {
		return nil, errors.New("sidecar: op is required")
	}
	callCtx := ctx
	var cancel context.CancelFunc
	if req.DeadlineMS > 0 {
		callCtx, cancel = context.WithTimeout(ctx, time.Duration(req.DeadlineMS)*time.Millisecond)
		defer cancel()
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.startLocked(); err != nil {
		return nil, err
	}
	line, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("sidecar: encode request: %w", err)
	}
	line = append(line, '\n')
	if _, err := c.stdin.Write(line); err != nil {
		c.stopLocked()
		return nil, fmt.Errorf("sidecar: write request: %w", err)
	}

	result := make(chan responseResult, 1)
	go func(reader *bufio.Reader) {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			result <- responseResult{err: fmt.Errorf("sidecar: read response: %w", err)}
			return
		}
		var response Response
		if err := json.Unmarshal(line, &response); err != nil {
			result <- responseResult{err: fmt.Errorf("sidecar: decode response: %w", err)}
			return
		}
		result <- responseResult{response: &response}
	}(c.reader)

	select {
	case <-callCtx.Done():
		c.stopLocked()
		return nil, callCtx.Err()
	case got := <-result:
		if got.err != nil {
			c.stopLocked()
			return nil, got.err
		}
		if got.response.ProtocolVersion != ProtocolVersion {
			c.stopLocked()
			return nil, fmt.Errorf("sidecar: unsupported response protocol version %d", got.response.ProtocolVersion)
		}
		if got.response.RequestID != req.RequestID {
			c.stopLocked()
			return nil, fmt.Errorf("sidecar: response request_id %q does not match %q", got.response.RequestID, req.RequestID)
		}
		return got.response, nil
	}
}

// Close terminates the child process and is safe to call more than once.
func (c *ProcessClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cmd == nil {
		return nil
	}
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	err := c.cmd.Process.Kill()
	_ = c.cmd.Wait()
	c.cmd, c.stdin, c.reader = nil, nil, nil
	return err
}
