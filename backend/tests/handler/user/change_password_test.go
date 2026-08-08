package user_test

import (
	"net/http"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

func TestChangePassword_Success(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/change-password", map[string]any{
		"currentPassword":         "oldpassword",
		"newPassword":             "newpassword1",
		"newPasswordConfirmation": "newpassword1",
	}, true)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestChangePassword_Unauthorized_NoToken(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/change-password", map[string]any{
		"currentPassword":         "oldpassword",
		"newPassword":             "newpassword1",
		"newPasswordConfirmation": "newpassword1",
	}, false)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestChangePassword_ConfirmationMismatch(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/change-password", map[string]any{
		"currentPassword":         "oldpassword",
		"newPassword":             "newpassword1",
		"newPasswordConfirmation": "different",
	}, true)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status %d, got %d", http.StatusUnprocessableEntity, rec.Code)
	}
}

func TestChangePassword_WrongCurrentPassword(t *testing.T) {
	engine := newEngine(&fakeService{changePasswordErr: entity.ErrInvalidCredentials})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/change-password", map[string]any{
		"currentPassword":         "wrong",
		"newPassword":             "newpassword1",
		"newPasswordConfirmation": "newpassword1",
	}, true)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}
