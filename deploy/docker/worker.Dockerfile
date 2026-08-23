# syntax=docker/dockerfile:1

FROM golang:alpine AS go-build
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/scheduler ./cmd/scheduler \
 && CGO_ENABLED=0 go build -trimpath -o /out/worker-interactive ./cmd/worker-interactive \
 && CGO_ENABLED=0 go build -trimpath -o /out/worker-browser ./cmd/worker-browser \
 && CGO_ENABLED=0 go build -trimpath -o /out/worker-light ./cmd/worker-light

# Pin this image to the Playwright version used by the project.
FROM python:3.13-slim
WORKDIR /opt/keeper
# The real repository should install the locked Playwright package and browser:
# RUN pip install --no-cache-dir -r sidecars/playwright/requirements.txt \
#  && python -m playwright install --with-deps chromium
COPY --from=go-build /out/scheduler /app/scheduler
COPY --from=go-build /out/worker-interactive /app/worker-interactive
COPY --from=go-build /out/worker-browser /app/worker-browser
COPY --from=go-build /out/worker-light /app/worker-light
COPY sidecars/playwright ./sidecars/playwright
COPY sidecars/protocol ./sidecars/protocol

# Install only locked sidecar dependencies in the real repository.
# RUN pip install --no-cache-dir -r sidecars/playwright/requirements.txt
# RUN corepack enable && cd sidecars/protocol && pnpm install --prod --frozen-lockfile

ENTRYPOINT []
CMD ["/app/worker-light"]
