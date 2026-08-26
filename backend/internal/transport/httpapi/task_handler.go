package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type createTaskReq struct {
	AccountID         uuid.UUID   `json:"account_id"`
	FriendID          uuid.UUID   `json:"friend_id"`
	Enabled           bool        `json:"enabled"`
	Timezone          string      `json:"timezone"`
	WindowStart       string      `json:"window_start"`
	WindowEnd         string      `json:"window_end"`
	Message           *messageReq `json:"message"`
	AllowFirstMessage bool        `json:"allow_first_message"`
}

type messageReq struct {
	Kind string  `json:"kind"`
	Body *string `json:"body"`
}

type patchTaskReq struct {
	Enabled           *bool       `json:"enabled"`
	Timezone          *string     `json:"timezone"`
	WindowStart       *string     `json:"window_start"`
	WindowEnd         *string     `json:"window_end"`
	Message           *messageReq `json:"message"`
	AllowFirstMessage *bool       `json:"allow_first_message"`
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	limit, err := taskLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	afterID, err := taskCursor(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.tasks.ListPageForUser(r.Context(), p.UserID, task.ListFilter{Limit: limit, AfterID: afterID})
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]TaskView, 0, len(page.Items))
	for _, t := range page.Items {
		items = append(items, taskView(t))
	}
	var nextCursor any
	if page.NextAfterID > 0 {
		nextCursor = encodeTaskCursor(page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nextCursor})
}

func taskLimit(r *http.Request) (int, error) {
	value := r.URL.Query().Get("limit")
	if value == "" {
		return 50, nil
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 || limit > 100 {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid limit")
	}
	return limit, nil
}

func taskCursor(r *http.Request) (int64, error) {
	value := r.URL.Query().Get("cursor")
	if value == "" {
		return 0, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	id, err := strconv.ParseInt(string(decoded), 10, 64)
	if err != nil || id < 1 {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	return id, nil
}

func encodeTaskCursor(id int64) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(id, 10)))
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	var req createTaskReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	kind := "text"
	var body *string
	if req.Message != nil {
		kind = req.Message.Kind
		body = req.Message.Body
	}
	created, err := s.tasks.Create(r.Context(), p.UserID, task.CreateInput{
		AccountPublicID: req.AccountID, FriendPublicID: req.FriendID,
		Enabled: req.Enabled, Timezone: req.Timezone,
		WindowStart: req.WindowStart, WindowEnd: req.WindowEnd,
		MessageKind: kind, MessageBody: body,
		AllowFirstMessage: req.AllowFirstMessage,
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeCreated(w, taskView(created))
}

func (s *Server) handlePatchTask(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "taskId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid task id"))
		return
	}
	var req patchTaskReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	var msgKind, msgBody *string
	if req.Message != nil {
		msgKind = &req.Message.Kind
		msgBody = req.Message.Body
	}
	updated, err := s.tasks.Update(r.Context(), p.UserID, id, task.TaskPatch{
		Enabled: req.Enabled, Timezone: req.Timezone,
		WindowStart: req.WindowStart, WindowEnd: req.WindowEnd,
		MessageKind: msgKind, MessageBody: msgBody,
		AllowFirstMessage: req.AllowFirstMessage,
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, taskView(updated))
}

func (s *Server) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "taskId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid task id"))
		return
	}
	if err := s.tasks.Delete(r.Context(), p.UserID, id); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleTaskRunNow(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "taskId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid task id"))
		return
	}
	intent, job, err := s.sends.RunNow(r.Context(), p.UserID, id, r.Header.Get("Idempotency-Key"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, map[string]any{
		"intent_id": intent.PublicID.String(),
		"job_id":    job.PublicID.String(),
		"status":    "queued",
	})
}
