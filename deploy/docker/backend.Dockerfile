# syntax=docker/dockerfile:1

FROM node:alpine AS frontend
WORKDIR /src
COPY . .
RUN corepack enable \
 && pnpm install --frozen-lockfile \
 && pnpm --filter ./apps/web build \
 && pnpm --filter ./apps/admin build

FROM golang:alpine AS go-build
WORKDIR /src
COPY backend ./backend
COPY db ./db
COPY --from=frontend /src/apps/web/dist ./backend/internal/webassets/dist/web
COPY --from=frontend /src/apps/admin/dist ./backend/internal/webassets/dist/admin
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
