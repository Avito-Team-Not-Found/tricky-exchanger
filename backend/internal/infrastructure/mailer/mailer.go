// Package mailer отправляет письма через внешний SMTP-сервер (net/smtp).
package mailer

import (
	"errors"
	"fmt"
	"mime"
	"net/mail"
	"net/smtp"
	"strings"
)

// ErrNotConfigured возвращается, если SMTP-хост не задан в конфиге —
// значит, отправка почты не настроена (например, локально у разработчика).
var ErrNotConfigured = errors.New("smtp is not configured")

// Config — параметры подключения к SMTP-серверу.
type Config struct {
	Host     string
	Port     string
	Username string
	Password string
	// From — адрес отправителя, попадает в заголовок "From" и в SMTP MAIL FROM.
	From string
}

// Service — отправитель почты поверх стандартного net/smtp.
type Service struct {
	cfg Config
}

func NewService(cfg Config) *Service {
	return &Service{cfg: cfg}
}

// SendRecoveryCode отправляет пользователю код восстановления пароля.
func (s *Service) SendRecoveryCode(to, code string) error {
	const subject = "Код для восстановления пароля"
	body := fmt.Sprintf(
		"Здравствуйте!\r\n\r\nВаш код для восстановления пароля: %s\r\nКод действителен 10 минут.\r\n\r\nЕсли вы не запрашивали восстановление пароля — проигнорируйте это письмо.",
		code,
	)

	return s.send(to, subject, body)
}

func (s *Service) send(to, subject, body string) error {
	if _, err := mail.ParseAddress(to); err != nil {
		return fmt.Errorf("invalid recipient address %q: %w", to, err)
	}

	if s.cfg.Host == "" {
		return ErrNotConfigured
	}

	addr := s.cfg.Host + ":" + s.cfg.Port
	auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)

	return smtp.SendMail(addr, auth, s.cfg.From, []string{to}, buildMessage(s.cfg.From, to, subject, body))
}

// buildMessage собирает MIME-письмо в кодировке UTF-8 (тема кодируется
// RFC 2047 encoded-word, т.к. содержит кириллицу).
func buildMessage(from, to, subject, body string) []byte {
	var b strings.Builder

	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + to + "\r\n")
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)

	return []byte(b.String())
}
