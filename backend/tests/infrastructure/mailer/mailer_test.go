package mailer_test

import (
	"errors"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/mailer"
)

func TestSendRecoveryCode_NotConfigured(t *testing.T) {
	svc := mailer.NewService(mailer.Config{})

	err := svc.SendRecoveryCode("ivan@example.com", "123456")
	if !errors.Is(err, mailer.ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestSendRecoveryCode_InvalidAddress(t *testing.T) {
	svc := mailer.NewService(mailer.Config{Host: "smtp.example.com", Port: "587", From: "noreply@example.com"})

	err := svc.SendRecoveryCode("not-an-email", "123456")
	if err == nil {
		t.Fatal("expected error for invalid recipient address")
	}
}

func TestSendChainFrozen_NotConfigured(t *testing.T) {
	svc := mailer.NewService(mailer.Config{})

	err := svc.SendChainFrozen("ivan@example.com", 7, "PlayStation 5", "iPhone 14")
	if !errors.Is(err, mailer.ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestSendReplacementInvitation_NotConfigured(t *testing.T) {
	svc := mailer.NewService(mailer.Config{})

	err := svc.SendReplacementInvitation("ivan@example.com", 7, "PlayStation 5", "iPhone 14")
	if !errors.Is(err, mailer.ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}
