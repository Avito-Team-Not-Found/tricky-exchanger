# ADR 0002: Режимы SMTP

## Context

`net/smtp.SendMail` не умеет implicit TLS (порт 465). На проде письма идут через
хостовый plaintext-релей к mail.ru (Docker без IPv6).

## Decision

Словарь `SMTP_ENCRYPTION`:

| Значение | Поведение |
|----------|-----------|
| `starttls` | plaintext dial → STARTTLS (дефолт) |
| `tls` | TLS с первого байта |
| `plain` | без TLS; AUTH через свой Plain без требования TLS |

## Consequences

Реализация — `internal/infrastructure/mailer` на `smtp.Client`.
