FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/api

FROM alpine:3.24

RUN adduser -D appuser
COPY --from=builder /server /server
COPY --from=builder /app/pkg/utils/ranker/models /models

ENV RANKER_MODE=ml
ENV RANKER_MODEL_PATH=/models/ranker_v1.txt

USER appuser
EXPOSE 8080
CMD ["/server"]