# syntax=docker/dockerfile:1
# keeper-worker: Go scheduler/workers + Playwright sidecar runtime (docs/16 §4).
# All four entrypoints share this image and differ only by command.

FROM golang:alpine AS go-build
WORKDIR /src
COPY backend ./backend
WORKDIR /src/backend
RUN CGO_ENABLED=0 go build -trimpath -o /out/scheduler ./cmd/scheduler \
 && CGO_ENABLED=0 go build -trimpath -o /out/worker-interactive ./cmd/worker-interactive \
 && CGO_ENABLED=0 go build -trimpath -o /out/worker-browser ./cmd/worker-browser \
 && CGO_ENABLED=0 go build -trimpath -o /out/worker-light ./cmd/worker-light

FROM python:3.13-slim
WORKDIR /opt/keeper
COPY --from=go-build /out/scheduler /app/scheduler
COPY --from=go-build /out/worker-interactive /app/worker-interactive
COPY --from=go-build /out/worker-browser /app/worker-browser
COPY --from=go-build /out/worker-light /app/worker-light
COPY sidecars/playwright ./sidecars/playwright
# Pin Playwright + install the locked browser and system deps.
RUN pip install --no-cache-dir -r sidecars/playwright/requirements.txt \
 && python -m playwright install --with-deps chromium

ENTRYPOINT []
CMD ["/app/worker-light"]