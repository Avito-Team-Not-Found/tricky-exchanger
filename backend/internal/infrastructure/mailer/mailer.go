// Package mailer отправляет письма через SMTP (plain / starttls / tls).
// net/smtp.SendMail не умеет implicit TLS, поэтому используется smtp.Client.
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

const dialTimeout = 10 * time.Second

type Encryption string

const (
	EncryptionPlain    Encryption = "plain"
	EncryptionSTARTTLS Encryption = "starttls"
	EncryptionTLS      Encryption = "tls"
)

// ErrNotConfigured — SMTP_HOST не задан.
var ErrNotConfigured = errors.New("smtp is not configured")

type Config struct {
	Host       string
	Port       string
	Username   string
	Password   string
	From       string
	Encryption Encryption // plain | starttls | tls; пусто = starttls
}

func (c Config) encryption() Encryption {
	if c.Encryption == "" {
		return EncryptionSTARTTLS
	}
	return c.Encryption
}

type Service struct {
	cfg Config
}

func NewService(cfg Config) *Service {
	return &Service{cfg: cfg}
}

func (s *Service) SendRecoveryCode(to, code string) error {
	const subject = "Код для восстановления пароля"
	body := fmt.Sprintf(
		"Здравствуйте!\r\n\r\nВаш код для восстановления пароля: %s\r\nКод действителен 10 минут.\r\n\r\nЕсли вы не запрашивали восстановление пароля — проигнорируйте это письмо.",
		code,
	)

	return s.send(to, subject, body)
}

// SendChainFrozen informs a participant that every member confirmed the exchange.
func (s *Service) SendChainFrozen(to string, chainID int64, gives, receives string) error {
	return s.send(
		to,
		"Обмен подтверждён всеми участниками",
		fmt.Sprintf("Цепочка обмена №%d собрана и заморожена.\r\n\r\nВы отдаёте: %s\r\nВы получаете: %s\r\n\r\nВсе участники подтвердили участие, товары зарезервированы для этой сделки.", chainID, gives, receives),
	)
}

// SendReplacementInvitation asks a candidate to explicitly accept a fast replacement.
func (s *Service) SendReplacementInvitation(to string, chainID int64, gives, receives string) error {
	return s.send(
		to,
		"Приглашение в обмен",
		fmt.Sprintf("Вас пригласили заменить участника в цепочке обмена №%d.\r\n\r\nВы отдаёте: %s\r\nВы получаете: %s\r\n\r\nОткройте предложение в приложении и самостоятельно подтвердите участие или откажитесь.", chainID, gives, receives),
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
		// PlainAuth из stdlib требует TLS, если хост не localhost.
		// Для EncryptionPlain (TLS-terminating relay) нужен свой Plain без этой проверки.
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

func (s *Service) dial() (*smtp.Client, error) {
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	tlsCfg := &tls.Config{ServerName: s.cfg.Host}

	switch s.cfg.encryption() {
	case EncryptionTLS:
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

// plainAuth — PLAIN без требования TLS (для plaintext-релея за TLS-терминатором).
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
