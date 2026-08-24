package httpapi

import (
	"net/http"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
)

type adminWorkerPoolView struct {
	Name              string  `json:"name"`
	Online            bool    `json:"online"`
	StartedAt         *string `json:"started_at"`
	LastObservedAt    *string `json:"last_observed_at"`
	ActiveWorkers     int     `json:"active_workers"`
	Concurrency       int     `json:"concurrency"`
	Version           *string `json:"version"`
	PlaywrightVersion *string `json:"playwright_version"`
	ProtocolVersion   *string `json:"protocol_version"`
}

type adminQueueView struct {
	Name           string `json:"name"`
	Pool           string `json:"pool"`
	Pending        int    `json:"pending"`
	Active         int    `json:"active"`
	Scheduled      int    `json:"scheduled"`
	Retry          int    `json:"retry"`
	Failed         int    `json:"failed"`
	Processed      int    `json:"processed"`
	LatencySeconds int    `json:"latency_seconds"`
	Paused         bool   `json:"paused"`
}

type adminRuntimeView struct {
	ObservedAt             string                `json:"observed_at"`
	APIVersion             *string               `json:"api_version"`
	WorkerVersion          *string               `json:"worker_version"`
	PlaywrightSidecar      *string               `json:"playwright_sidecar_version"`
	ProtocolSidecar        *string               `json:"protocol_sidecar_version"`
	Pools                  []adminWorkerPoolView `json:"pools"`
	Queues                 []adminQueueView      `json:"queues"`
	RunningJobs            int                   `json:"running_jobs"`
	FailedJobs24h          int                   `json:"failed_jobs_24h"`
	BrowserSlotsUsed       int                   `json:"browser_slots_used"`
	BrowserSlotsLimit      int                   `json:"browser_slots_limit"`
	SchedulerOnline        bool                  `json:"scheduler_online"`
	SchedulerLeaderExpires *string               `json:"scheduler_leader_expires_at"`
}

func (s *Server) handleAdminRuntime(w http.ResponseWriter, r *http.Request) {
	summary, err := s.admin.Runtime(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, adminRuntimeViewFrom(summary))
}

func adminRuntimeViewFrom(summary admin.RuntimeSummary) adminRuntimeView {
	view := adminRuntimeView{
		ObservedAt: summary.ObservedAt.Format(timeRFC3339), APIVersion: summary.APIVersion,
		WorkerVersion: summary.WorkerVersion, PlaywrightSidecar: summary.PlaywrightSidecar,
		ProtocolSidecar: summary.ProtocolSidecar, RunningJobs: summary.RunningJobs,
		FailedJobs24h: summary.FailedJobs24h, BrowserSlotsUsed: summary.BrowserSlotsUsed,
		BrowserSlotsLimit: summary.BrowserSlotsLimit, SchedulerOnline: summary.SchedulerOnline,
		SchedulerLeaderExpires: formatOptionalAdminTime(summary.SchedulerLeaderExpires),
		Pools:                  make([]adminWorkerPoolView, 0, len(summary.Pools)), Queues: make([]adminQueueView, 0, len(summary.Queues)),
	}
	for _, pool := range summary.Pools {
		view.Pools = append(view.Pools, adminWorkerPoolView{
			Name: pool.Name, Online: pool.Online, StartedAt: formatOptionalAdminTime(pool.StartedAt),
			LastObservedAt: formatOptionalAdminTime(pool.LastObservedAt), ActiveWorkers: pool.ActiveWorkers,
			Concurrency: pool.Concurrency, Version: pool.Version, PlaywrightVersion: pool.PlaywrightVersion,
			ProtocolVersion: pool.ProtocolVersion,
		})
	}
	for _, queue := range summary.Queues {
		view.Queues = append(view.Queues, adminQueueView{
			Name: queue.Name, Pool: queue.Pool, Pending: queue.Pending, Active: queue.Active,
			Scheduled: queue.Scheduled, Retry: queue.Retry, Failed: queue.Failed,
			Processed: queue.Processed, LatencySeconds: queue.LatencySeconds, Paused: queue.Paused,
		})
	}
	return view
}

const timeRFC3339 = "2006-01-02T15:04:05Z07:00"
