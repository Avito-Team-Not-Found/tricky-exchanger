FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/api

FROM alpine:3.24

RUN adduser -D appuser
COPY --from=builder /server /server

USER appuser
EXPOSE 8080
CMD ["/server"]