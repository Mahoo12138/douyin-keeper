package httpapi

import (
	"net/http"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
)

type adminFailureCodeView struct {
	Code  string `json:"code"`
	Count int    `json:"count"`
}

type adminAdapterSuccessRateView struct {
	Name        string  `json:"name"`
	Succeeded   int     `json:"succeeded"`
	Failed      int     `json:"failed"`
	SuccessRate float64 `json:"success_rate"`
}

type adminOverviewView struct {
	ObservedAt           string                        `json:"observed_at"`
	ActiveUsers          int                           `json:"active_users"`
	DAU                  int                           `json:"dau"`
	ActiveAccounts       int                           `json:"active_accounts"`
	TodaySendSucceeded   int                           `json:"today_send_succeeded"`
	TodaySendFailed      int                           `json:"today_send_failed"`
	TodaySendSuccessRate float64                       `json:"today_send_success_rate"`
	RiskAccounts         int                           `json:"risk_accounts"`
	QueuePending         int                           `json:"queue_pending"`
	QueueActive          int                           `json:"queue_active"`
	QueueRetry           int                           `json:"queue_retry"`
	QueueLatencySeconds  int                           `json:"queue_latency_seconds"`
	WorkersOnline        int                           `json:"workers_online"`
	WorkersTotal         int                           `json:"workers_total"`
	FailureCodes         []adminFailureCodeView        `json:"failure_codes"`
	AdapterSuccessRates  []adminAdapterSuccessRateView `json:"adapter_success_rates"`
}

func (s *Server) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	summary, err := s.admin.Overview(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, adminOverviewViewFrom(summary))
}

func adminOverviewViewFrom(summary admin.OverviewSummary) adminOverviewView {
	view := adminOverviewView{
		ObservedAt:  summary.ObservedAt.Format(timeRFC3339),
		ActiveUsers: summary.ActiveUsers, DAU: summary.DAU,
		ActiveAccounts:     summary.ActiveAccounts,
		TodaySendSucceeded: summary.TodaySendSucceeded, TodaySendFailed: summary.TodaySendFailed,
		TodaySendSuccessRate: successRate(summary.TodaySendSucceeded, summary.TodaySendFailed),
		RiskAccounts:         summary.RiskAccounts,
		QueuePending:         summary.QueuePending, QueueActive: summary.QueueActive, QueueRetry: summary.QueueRetry,
		QueueLatencySeconds: summary.QueueLatencySeconds,
		WorkersOnline:       summary.WorkersOnline, WorkersTotal: summary.WorkersTotal,
		FailureCodes:        make([]adminFailureCodeView, 0, len(summary.FailureCodes)),
		AdapterSuccessRates: make([]adminAdapterSuccessRateView, 0, len(summary.AdapterSuccesses)),
	}
	for _, item := range summary.FailureCodes {
		view.FailureCodes = append(view.FailureCodes, adminFailureCodeView{Code: item.Code, Count: item.Count})
	}
	for _, item := range summary.AdapterSuccesses {
		view.AdapterSuccessRates = append(view.AdapterSuccessRates, adminAdapterSuccessRateView{
			Name: item.Name, Succeeded: item.Succeeded, Failed: item.Failed,
			SuccessRate: successRate(item.Succeeded, item.Failed),
		})
	}
	return view
}

func successRate(succeeded, failed int) float64 {
	total := succeeded + failed
	if total <= 0 {
		return 0
	}
	return float64(succeeded) / float64(total)
}
