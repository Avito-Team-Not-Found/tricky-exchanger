// Package mailer отправляет письма через внешний SMTP-сервер (net/smtp).
//
// Поддерживает три классических режима шифрования соединения:
//
//   - EncryptionPlain    — без шифрования вообще. Обычно порт 25. Учётные данные
//     и письмо идут открытым текстом — использовать только для доверенных
//     внутренних релеев без аутентификации, для реальных почтовых провайдеров
//     не годится (они его просто не поддерживают для AUTH).
//   - EncryptionSTARTTLS — соединение начинается как обычный plaintext TCP,
//     клиент шлёт EHLO, сервер объявляет поддержку STARTTLS, клиент явно
//     командой STARTTLS повышает уже открытое соединение до TLS — и только
//     после этого идёт AUTH и само письмо. Обычно порт 587 (иногда 25).
//   - EncryptionTLS      — TLS с первого байта (implicit TLS, как у HTTPS):
//     TCP-соединение сразу оборачивается в TLS, plaintext-фазы нет вообще.
//     Обычно порт 465 (RFC 8314 сейчас рекомендует именно его).
//
// Стандартный smtp.SendMail из net/smtp умеет только plain и (неявно, если
// сервер его анонсирует) starttls — implicit TLS он не поддерживает вообще,
// т.к. всегда сам поднимает обычное net.Dial. Поэтому здесь используется
// низкоуровневый smtp.Client, чтобы явно управлять всеми тремя режимами.
package mailer

import (
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

// dialTimeout — чтобы send-code не висел бесконечно, если SMTP недоступен
// (типичный кейс: у VPS открыт только IPv6 до mail.ru, а Docker ходит по IPv4).
const dialTimeout = 10 * time.Second

// Encryption — режим шифрования соединения с SMTP-сервером.
type Encryption string

const (
	EncryptionPlain    Encryption = "plain"
	EncryptionSTARTTLS Encryption = "starttls"
	EncryptionTLS      Encryption = "tls"
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
	// Encryption — "plain" | "starttls" | "tls". Пустое значение трактуется как starttls
	// (самый распространённый режим у почтовых провайдеров на порту 587).
	Encryption Encryption
}

func (c Config) encryption() Encryption {
	if c.Encryption == "" {
		return EncryptionSTARTTLS
	}
	return c.Encryption
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

// SendChainFrozen informs a participant that every member confirmed the exchange.
func (s *Service) SendChainFrozen(to string, chainID int64) error {
	return s.send(
		to,
		"Обмен подтверждён всеми участниками",
		fmt.Sprintf("Цепочка обмена №%d собрана и заморожена. Все участники подтвердили участие, товары зарезервированы для этой сделки.", chainID),
	)
}

// SendReplacementInvitation asks a candidate to explicitly accept a fast replacement.
func (s *Service) SendReplacementInvitation(to string, chainID int64) error {
	return s.send(
		to,
		"Приглашение в обмен",
		fmt.Sprintf("Вас пригласили заменить участника в цепочке обмена №%d. Откройте предложение в приложении и самостоятельно подтвердите участие или откажитесь.", chainID),
	)
}

func (s *Service) send(to, subject, body string) error {
	if _, err := mail.ParseAddress(to); err != nil {
		return fmt.Errorf("invalid recipient address %q: %w", to, err)
	}

	if s.cfg.Host == "" {
		return ErrNotConfigured
	}

	client, err := s.dial()
	if err != nil {
		return fmt.Errorf("connect to smtp server: %w", err)
	}
	defer client.Close()

	if s.cfg.Username != "" {
		if ok, _ := client.Extension("AUTH"); !ok {
			return fmt.Errorf("smtp server does not support AUTH")
		}
		// net/smtp.PlainAuth отказывается слать пароль без TLS, если хост не localhost.
		// Для EncryptionPlain (локальный TLS-terminating relay на docker gateway) это
		// ломает AUTH — используем свой Plain, который не делает эту проверку.
		auth := smtp.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host))
		if s.cfg.encryption() == EncryptionPlain {
			auth = plainAuth{username: s.cfg.Username, password: s.cfg.Password}
		}
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := client.Mail(s.cfg.From); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err := w.Write(buildMessage(s.cfg.From, to, subject, body)); err != nil {
		_ = w.Close()
		return fmt.Errorf("write message body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("finish smtp DATA: %w", err)
	}

	return client.Quit()
}

// dial устанавливает соединение с сервером в соответствии с s.cfg.Encryption
// и возвращает готовый к AUTH/MAIL/RCPT smtp.Client.
func (s *Service) dial() (*smtp.Client, error) {
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	tlsCfg := &tls.Config{ServerName: s.cfg.Host}

	switch s.cfg.encryption() {
	case EncryptionTLS:
		// implicit TLS — шифруем соединение сразу, до какого-либо SMTP-диалога.
		dialer := &net.Dialer{Timeout: dialTimeout}
		conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsCfg)
		if err != nil {
			return nil, fmt.Errorf("tls dial: %w", err)
		}
		return smtp.NewClient(conn, s.cfg.Host)

	case EncryptionSTARTTLS:
		conn, err := (&net.Dialer{Timeout: dialTimeout}).Dial("tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("dial: %w", err)
		}
		_ = conn.SetDeadline(time.Now().Add(dialTimeout))
		client, err := smtp.NewClient(conn, s.cfg.Host)
		if err != nil {
			_ = conn.Close()
			return nil, err
		}
		if ok, _ := client.Extension("STARTTLS"); !ok {
			_ = client.Close()
			return nil, fmt.Errorf("smtp server does not support STARTTLS")
		}
		if err := client.StartTLS(tlsCfg); err != nil {
			_ = client.Close()
			return nil, fmt.Errorf("starttls: %w", err)
		}
		// После handshake снимаем дедлайн — письмо может уходить дольше dialTimeout.
		_ = conn.SetDeadline(time.Time{})
		return client, nil

	case EncryptionPlain:
		conn, err := (&net.Dialer{Timeout: dialTimeout}).Dial("tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("dial: %w", err)
		}
		_ = conn.SetDeadline(time.Now().Add(dialTimeout))
		client, err := smtp.NewClient(conn, s.cfg.Host)
		if err != nil {
			_ = conn.Close()
			return nil, err
		}
		_ = conn.SetDeadline(time.Time{})
		return client, nil

	default:
		return nil, fmt.Errorf("unknown smtp encryption mode %q", s.cfg.Encryption)
	}
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

// plainAuth — PLAIN AUTH без требования TLS (см. send()). Нужен для SMTP-релея
// на хосте VPS, где TLS уже терминирован, а до контейнера идёт plaintext.
type plainAuth struct {
	username string
	password string
}

func (a plainAuth) Start(_ *smtp.ServerInfo) (string, []byte, error) {
	resp := []byte("\x00" + a.username + "\x00" + a.password)
	return "PLAIN", resp, nil
}

func (a plainAuth) Next(_ []byte, more bool) ([]byte, error) {
	if more {
		return nil, errors.New("unexpected server challenge")
	}
	return nil, nil
}
