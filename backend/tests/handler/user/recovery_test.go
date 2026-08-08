package user_test

import (
	"net/http"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

func TestSendRecoveryCode_Success(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/send-code/", map[string]any{
		"email": "ivan@example.com",
	}, false)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestSendRecoveryCode_UnknownEmail(t *testing.T) {
	engine := newEngine(&fakeService{sendRecoveryCodeErr: entity.ErrUserNotFound})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/send-code/", map[string]any{
		"email": "unknown@example.com",
	}, false)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}

func TestSendRecoveryCode_InvalidBody(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/send-code/", map[string]any{
		"email": "not-an-email",
	}, false)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status %d, got %d", http.StatusUnprocessableEntity, rec.Code)
	}
}

func TestVerifyRecoveryCode_Success(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/verify-code/", map[string]any{
		"email": "ivan@example.com",
		"code":  "123456",
	}, false)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestVerifyRecoveryCode_Invalid(t *testing.T) {
	engine := newEngine(&fakeService{verifyRecoveryCodeErr: entity.ErrInvalidRecoveryCode})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/verify-code/", map[string]any{
		"email": "ivan@example.com",
		"code":  "000000",
	}, false)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestVerifyRecoveryCode_InvalidBody(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/verify-code/", map[string]any{
		"email": "ivan@example.com",
		"code":  "12", // не 6 символов
	}, false)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status %d, got %d", http.StatusUnprocessableEntity, rec.Code)
	}
}

func TestResetPassword_Success(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/reset-password/", map[string]any{
		"email":    "ivan@example.com",
		"code":     "123456",
		"password": "newpassword1",
	}, false)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestResetPassword_InvalidCode(t *testing.T) {
	engine := newEngine(&fakeService{resetPasswordErr: entity.ErrInvalidRecoveryCode})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/reset-password/", map[string]any{
		"email":    "ivan@example.com",
		"code":     "000000",
		"password": "newpassword1",
	}, false)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestResetPassword_UnknownEmail(t *testing.T) {
	engine := newEngine(&fakeService{resetPasswordErr: entity.ErrUserNotFound})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/reset-password/", map[string]any{
		"email":    "unknown@example.com",
		"code":     "123456",
		"password": "newpassword1",
	}, false)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}

func TestResetPassword_ShortPassword(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/account/password-recovery/reset-password/", map[string]any{
		"email":    "ivan@example.com",
		"code":     "123456",
		"password": "short",
	}, false)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status %d, got %d", http.StatusUnprocessableEntity, rec.Code)
	}
}
