# syntax=docker/dockerfile:1
# keeper-backend: Go API + embedded unified TanStack SPA (docs/16 §3).
# Build: docker build -f deploy/docker/backend.Dockerfile -t douyin-keeper/backend:local .

FROM node:alpine AS frontend
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN corepack enable \
 && pnpm install --frozen-lockfile \
 && pnpm --filter @douyin-keeper/web build

FROM golang:alpine AS go-build
WORKDIR /src
COPY backend ./backend
COPY --from=frontend /src/apps/web/dist ./backend/internal/transport/webassets/dist/web
WORKDIR /src/backend
RUN CGO_ENABLED=0 go build -trimpath -o /out/backend ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -o /out/migrate ./cmd/migrate

FROM alpine
RUN addgroup -S keeper && adduser -S -G keeper keeper \
 && apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=go-build /out/backend /app/backend
COPY --from=go-build /out/migrate /app/migrate
USER keeper
EXPOSE 8080
CMD ["/app/backend"]
