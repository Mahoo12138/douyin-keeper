package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type createTaskReq struct {
	AccountID         uuid.UUID `json:"account_id"`
	FriendID          uuid.UUID `json:"friend_id"`
	Enabled           bool      `json:"enabled"`
	Timezone          string    `json:"timezone"`
	WindowStart       string    `json:"window_start"`
	WindowEnd         string    `json:"window_end"`
	Message           *messageReq `json:"message"`
	AllowFirstMessage bool      `json:"allow_first_message"`
}

type messageReq struct {
	Kind string  `json:"kind"`
	Body *string `json:"body"`
}

type patchTaskReq struct {
	Enabled           *bool      `json:"enabled"`
	Timezone          *string    `json:"timezone"`
	WindowStart       *string    `json:"window_start"`
	WindowEnd         *string    `json:"window_end"`
	Message           *messageReq `json:"message"`
	AllowFirstMessage *bool      `json:"allow_first_message"`
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	tasks, err := s.tasks.ListForUser(r.Context(), p.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]TaskView, 0, len(tasks))
	for _, t := range tasks {
		items = append(items, taskView(t))
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nil})
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
	intent, job, err := s.sends.RunNow(r.Context(), p.UserID, id)
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