# === Builder ===
FROM golang:1.25-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

# === Dev (with hot reload) ===
# 1.26 here (not 1.25 like builder/prod) because air-verse/air@latest requires
# go >= 1.26 to `go install`; this stage only runs local hot-reload, never ships.
FROM golang:1.26-alpine AS dev
WORKDIR /app
RUN apk add --no-cache git && \
    go install github.com/air-verse/air@latest
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

# === Prod ===
FROM gcr.io/distroless/static-debian12 AS prod
COPY --from=builder /out/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
