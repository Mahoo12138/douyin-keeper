package sidecar

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
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
	dir     string
	args    []string

	mu     sync.Mutex
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader *bufio.Reader
}

// ErrProcessStart identifies a failure that occurred before a request could
// be written to the Sidecar. It is the only transport failure eligible for a
// safe automatic retry; write/read failures leave platform outcome unknown.
var ErrProcessStart = errors.New("sidecar process start failed")

func NewProcessClient(command string, args ...string) *ProcessClient {
	return NewProcessClientInDir(command, "", args...)
}

// NewProcessClientInDir is used for verified bundles whose entrypoint may use
// sibling runtime files. The working directory is never inferred from input
// requests; it is fixed when the worker constructs the client.
func NewProcessClientInDir(command, dir string, args ...string) *ProcessClient {
	return &ProcessClient{command: command, dir: dir, args: append([]string(nil), args...)}
}

func (c *ProcessClient) startLocked() error {
	if c.cmd != nil {
		return nil
	}
	if c.command == "" {
		return errors.New("sidecar: empty process command")
	}
	cmd := exec.Command(c.command, c.args...)
	cmd.Dir = c.dir
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
	if !IsKnownOperation(req.Op) {
		return nil, fmt.Errorf("sidecar: unsupported operation %q", req.Op)
	}
	if req.DeadlineMS == 0 {
		req.DeadlineMS = DefaultDeadlineMS
	}
	if req.DeadlineMS < MinDeadlineMS || req.DeadlineMS > MaxDeadlineMS {
		return nil, fmt.Errorf("sidecar: deadline_ms must be between %d and %d", MinDeadlineMS, MaxDeadlineMS)
	}
	if req.Input == nil {
		req.Input = map[string]any{}
	}
	if !isJSONObject(req.Input) {
		return nil, errors.New("sidecar: input must be a JSON object")
	}
	if err := validateOperationInput(req.Op, req.Input); err != nil {
		return nil, err
	}
	callCtx := ctx
	var cancel context.CancelFunc
	if req.DeadlineMS > 0 {
		callCtx, cancel = context.WithTimeout(ctx, time.Duration(req.DeadlineMS)*time.Millisecond)
		defer cancel()
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if err := callCtx.Err(); err != nil {
		return nil, err
	}
	if err := c.startLocked(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrProcessStart, err)
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
		response, err := decodeResponse(line)
		if err != nil {
			result <- responseResult{err: err}
			return
		}
		result <- responseResult{response: response}
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
		if got.response == nil {
			c.stopLocked()
			return nil, errors.New("sidecar: empty response")
		}
		if got.response.ProtocolVersion != ProtocolVersion {
			c.stopLocked()
			return nil, fmt.Errorf("sidecar: unsupported response protocol version %d", got.response.ProtocolVersion)
		}
		if got.response.RequestID != req.RequestID {
			c.stopLocked()
			return nil, fmt.Errorf("sidecar: response request_id %q does not match %q", got.response.RequestID, req.RequestID)
		}
		if got.response.OK && got.response.Error != nil {
			c.stopLocked()
			return nil, errors.New("sidecar: successful response contains error")
		}
		if !got.response.OK && (got.response.Error == nil || got.response.Error.Code == "") {
			c.stopLocked()
			return nil, errors.New("sidecar: failed response is missing error code")
		}
		if got.response.OK && !isJSONObject(got.response.Result) {
			c.stopLocked()
			return nil, errors.New("sidecar: successful response result must be a JSON object")
		}
		return got.response, nil
	}
}

func decodeResponse(line []byte) (*Response, error) {
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()
	var response Response
	if err := decoder.Decode(&response); err != nil {
		return nil, fmt.Errorf("sidecar: decode response: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, errors.New("sidecar: response contains multiple JSON values")
		}
		return nil, fmt.Errorf("sidecar: decode trailing response data: %w", err)
	}

	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(line, &envelope); err != nil {
		return nil, fmt.Errorf("sidecar: decode response envelope: %w", err)
	}
	for _, key := range []string{"protocol_version", "request_id", "ok", "meta"} {
		if _, ok := envelope[key]; !ok {
			return nil, fmt.Errorf("sidecar: response is missing %s", key)
		}
	}
	if response.OK {
		if _, ok := envelope["result"]; !ok {
			return nil, errors.New("sidecar: successful response is missing result")
		}
	} else if _, ok := envelope["error"]; !ok {
		return nil, errors.New("sidecar: failed response is missing error")
	}

	var meta map[string]json.RawMessage
	if err := json.Unmarshal(envelope["meta"], &meta); err != nil || meta == nil {
		return nil, errors.New("sidecar: response meta must be an object")
	}
	for _, key := range []string{"adapter", "adapter_version", "duration_ms"} {
		if _, ok := meta[key]; !ok {
			return nil, fmt.Errorf("sidecar: response meta is missing %s", key)
		}
	}
	if response.Meta.DurationMS < 0 {
		return nil, errors.New("sidecar: response duration_ms must not be negative")
	}
	if response.RequestID == "" {
		return nil, errors.New("sidecar: response request_id is required")
	}
	if response.Error != nil {
		if response.Error.Detail != nil && !isJSONObject(response.Error.Detail) {
			return nil, errors.New("sidecar: response error detail must be a JSON object")
		}
		for _, key := range []string{"code", "retryable", "message"} {
			if _, ok := mustObject(envelope["error"])[key]; !ok {
				return nil, fmt.Errorf("sidecar: response error is missing %s", key)
			}
		}
	}
	return &response, nil
}

func mustObject(raw json.RawMessage) map[string]json.RawMessage {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil {
		return nil
	}
	return object
}

func isJSONObject(value any) bool {
	_, err := jsonObject(value)
	return err == nil
}

func jsonObject(value any) (map[string]json.RawMessage, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil {
		return nil, err
	}
	if object == nil {
		return nil, errors.New("not a JSON object")
	}
	return object, nil
}

func validateOperationInput(op string, input any) error {
	if op != OpsMessageSendFirst {
		return nil
	}
	object, err := jsonObject(input)
	if err != nil {
		return errors.New("sidecar: message.send_first input must be a JSON object")
	}
	if err := rejectUnknownFields(object, "session", "target", "message"); err != nil {
		return fmt.Errorf("sidecar: message.send_first %w", err)
	}
	session, err := objectField(object, "session")
	if err != nil {
		return fmt.Errorf("sidecar: message.send_first %w", err)
	}
	if err := rejectUnknownFields(session, "kind", "path"); err != nil {
		return fmt.Errorf("sidecar: message.send_first session %w", err)
	}
	kind, kindErr := stringField(session, "kind")
	path, pathErr := stringField(session, "path")
	if kindErr != nil || kind != "playwright_storage_state_file" || pathErr != nil || strings.TrimSpace(path) == "" {
		return errors.New("sidecar: message.send_first session must reference a storage state file")
	}
	target, err := objectField(object, "target")
	if err != nil {
		return fmt.Errorf("sidecar: message.send_first %w", err)
	}
	if err := rejectUnknownFields(target, "platform_user_id"); err != nil {
		return fmt.Errorf("sidecar: message.send_first target %w", err)
	}
	userID, err := stringField(target, "platform_user_id")
	if err != nil || strings.TrimSpace(userID) == "" || utf8.RuneCountInString(userID) > 256 {
		return errors.New("sidecar: message.send_first target.platform_user_id must be 1..256 characters")
	}
	message, err := objectField(object, "message")
	if err != nil {
		return fmt.Errorf("sidecar: message.send_first %w", err)
	}
	if err := rejectUnknownFields(message, "text"); err != nil {
		return fmt.Errorf("sidecar: message.send_first message %w", err)
	}
	text, err := stringField(message, "text")
	if err != nil || strings.TrimSpace(text) == "" || utf8.RuneCountInString(text) > 2000 {
		return errors.New("sidecar: message.send_first message.text must be 1..2000 characters")
	}
	return nil
}

func rejectUnknownFields(object map[string]json.RawMessage, allowed ...string) error {
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, field := range allowed {
		allowedSet[field] = struct{}{}
	}
	for field := range object {
		if _, ok := allowedSet[field]; !ok {
			return fmt.Errorf("contains unknown field %q", field)
		}
	}
	return nil
}

func objectField(object map[string]json.RawMessage, field string) (map[string]json.RawMessage, error) {
	raw, ok := object[field]
	if !ok {
		return nil, fmt.Errorf("%s must be an object", field)
	}
	value, err := jsonObject(raw)
	if err != nil {
		return nil, fmt.Errorf("%s must be an object", field)
	}
	return value, nil
}

func stringField(object map[string]json.RawMessage, field string) (string, error) {
	raw, ok := object[field]
	if !ok {
		return "", fmt.Errorf("%s is required", field)
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("%s must be a string", field)
	}
	return value, nil
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
