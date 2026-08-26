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

FROM node:22-bookworm-slim
WORKDIR /opt/keeper
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=go-build /out/scheduler /app/scheduler
COPY --from=go-build /out/worker-interactive /app/worker-interactive
COPY --from=go-build /out/worker-browser /app/worker-browser
COPY --from=go-build /out/worker-light /app/worker-light
COPY sidecars/playwright-node/package.json sidecars/playwright-node/package-lock.json ./sidecars/playwright-node/
# Pin the Node Playwright runtime and install the locked browser/system deps.
RUN cd sidecars/playwright-node \
 && npm ci --omit=dev \
 && npx playwright install --with-deps chromium \
 && chmod -R a+rX /ms-playwright
COPY sidecars/playwright-node ./sidecars/playwright-node

USER node
ENTRYPOINT []
CMD ["/app/worker-light"]
