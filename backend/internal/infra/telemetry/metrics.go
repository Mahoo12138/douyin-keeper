package telemetry

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Label is a bounded Prometheus label. Callers must only pass controlled
// values (adapter names, job kinds and statuses), never user input.
type Label struct {
	Name  string
	Value string
}

type metricKey struct {
	name   string
	labels string
}

type histogramValue struct {
	counts []uint64
	sum    float64
	count  uint64
}

// Metrics is a small in-process Prometheus registry. It deliberately keeps no
// global state, so API and worker processes can be scraped independently and
// tests can use isolated registries.
type Metrics struct {
	mu         sync.RWMutex
	counters   map[metricKey]uint64
	gauges     map[metricKey]float64
	histograms map[metricKey]*histogramValue
	types      map[string]string
	help       map[string]string
}

var defaultHistogramBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60}

func NewMetrics() *Metrics {
	return &Metrics{
		counters:   make(map[metricKey]uint64),
		gauges:     make(map[metricKey]float64),
		histograms: make(map[metricKey]*histogramValue),
		types:      make(map[string]string),
		help:       make(map[string]string),
	}
}

func (m *Metrics) ensure() {
	if m.counters == nil {
		m.counters = make(map[metricKey]uint64)
	}
	if m.gauges == nil {
		m.gauges = make(map[metricKey]float64)
	}
	if m.histograms == nil {
		m.histograms = make(map[metricKey]*histogramValue)
	}
	if m.types == nil {
		m.types = make(map[string]string)
	}
	if m.help == nil {
		m.help = make(map[string]string)
	}
}

func (m *Metrics) register(name, kind, help string) {
	if _, ok := m.types[name]; !ok {
		m.types[name] = kind
	}
	if help != "" {
		m.help[name] = help
	}
}

func (m *Metrics) AddCounter(name string, amount uint64, labels ...Label) {
	if m == nil || name == "" || amount == 0 {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ensure()
	m.register(name, "counter", "")
	m.counters[metricKey{name: name, labels: encodeLabels(labels)}] += amount
}

func (m *Metrics) AddGauge(name string, amount float64, labels ...Label) {
	if m == nil || name == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ensure()
	m.register(name, "gauge", "")
	m.gauges[metricKey{name: name, labels: encodeLabels(labels)}] += amount
}

func (m *Metrics) SetGauge(name string, value float64, labels ...Label) {
	if m == nil || name == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ensure()
	m.register(name, "gauge", "")
	m.gauges[metricKey{name: name, labels: encodeLabels(labels)}] = value
}

// Observe records seconds for a histogram. The buckets are fixed to keep
// scrape output stable and memory bounded.
func (m *Metrics) Observe(name string, seconds float64, labels ...Label) {
	if m == nil || name == "" || seconds < 0 {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ensure()
	m.register(name, "histogram", "")
	key := metricKey{name: name, labels: encodeLabels(labels)}
	h := m.histograms[key]
	if h == nil {
		h = &histogramValue{counts: make([]uint64, len(defaultHistogramBuckets))}
		m.histograms[key] = h
	}
	for i, bound := range defaultHistogramBuckets {
		if seconds <= bound {
			h.counts[i]++
		}
	}
	h.count++
	h.sum += seconds
}

func (m *Metrics) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(m.Render()))
	})
}

// StartMetricsServer exposes worker-process metrics on an internal-only
// listener. The caller owns the process context; shutdown is graceful and the
// endpoint contains only bounded operational dimensions.
func StartMetricsServer(ctx context.Context, addr string, metrics *Metrics, log *slog.Logger) {
	if addr == "" || metrics == nil {
		return
	}
	server := &http.Server{Addr: addr, Handler: metrics.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) && log != nil {
			log.Error("metrics server stopped", "err", err)
		}
	}()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
}

func (m *Metrics) Render() string {
	if m == nil {
		return ""
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	var b strings.Builder
	names := make(map[string]struct{}, len(m.types))
	for name := range m.types {
		names[name] = struct{}{}
	}
	for key := range m.counters {
		names[key.name] = struct{}{}
	}
	for key := range m.gauges {
		names[key.name] = struct{}{}
	}
	for key := range m.histograms {
		names[key.name] = struct{}{}
	}
	ordered := make([]string, 0, len(names))
	for name := range names {
		ordered = append(ordered, name)
	}
	sort.Strings(ordered)
	for _, name := range ordered {
		if help := m.help[name]; help != "" {
			fmt.Fprintf(&b, "# HELP %s %s\n", name, help)
		}
		if kind := m.types[name]; kind != "" {
			fmt.Fprintf(&b, "# TYPE %s %s\n", name, kind)
		}
		keys := metricKeysFor(m.counters, name)
		for _, key := range keys {
			fmt.Fprintf(&b, "%s%s %d\n", name, key.labels, m.counters[key])
		}
		keys = metricKeysFor(m.gauges, name)
		for _, key := range keys {
			fmt.Fprintf(&b, "%s%s %s\n", name, key.labels, strconv.FormatFloat(m.gauges[key], 'f', -1, 64))
		}
		keys = metricKeysFor(m.histograms, name)
		for _, key := range keys {
			h := m.histograms[key]
			for i, bound := range defaultHistogramBuckets {
				fmt.Fprintf(&b, "%s_bucket%s %d\n", name, addLabel(key.labels, "le", strconv.FormatFloat(bound, 'f', -1, 64)), h.counts[i])
			}
			fmt.Fprintf(&b, "%s_bucket%s %d\n", name, addLabel(key.labels, "le", "+Inf"), h.count)
			fmt.Fprintf(&b, "%s_sum%s %s\n", name, key.labels, strconv.FormatFloat(h.sum, 'f', -1, 64))
			fmt.Fprintf(&b, "%s_count%s %d\n", name, key.labels, h.count)
		}
	}
	return b.String()
}

func metricKeysFor[T any](values map[metricKey]T, name string) []metricKey {
	keys := make([]metricKey, 0)
	for key := range values {
		if key.name == name {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].labels < keys[j].labels })
	return keys
}

func encodeLabels(labels []Label) string {
	if len(labels) == 0 {
		return ""
	}
	items := append([]Label(nil), labels...)
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	var b strings.Builder
	b.WriteByte('{')
	for i, label := range items {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%s=\"%s\"", label.Name, escapeLabel(label.Value))
	}
	b.WriteByte('}')
	return b.String()
}

func addLabel(encoded, name, value string) string {
	if encoded == "" {
		return encodeLabels([]Label{{Name: name, Value: value}})
	}
	return strings.TrimSuffix(encoded, "}") + "," + name + "=\"" + escapeLabel(value) + "\"}"
}

func escapeLabel(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return strings.ReplaceAll(value, "\n", `\n`)
}
