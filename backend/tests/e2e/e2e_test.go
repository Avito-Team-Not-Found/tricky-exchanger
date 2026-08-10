//go:build e2e

package e2e_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"
)

func baseURL() string {
	if v := os.Getenv("BASE_URL"); v != "" {
		return v
	}
	return "http://localhost:8080"
}

func waitHealthy(t *testing.T) {
	t.Helper()
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(90 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		resp, err := client.Get(baseURL() + "/healthz")
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
			lastErr = fmt.Errorf("healthz status %d", resp.StatusCode)
		} else {
			lastErr = err
		}
		time.Sleep(1 * time.Second)
	}
	t.Fatalf("API not healthy at %s: %v", baseURL(), lastErr)
}

func doJSON(t *testing.T, method, path string, body any, token string) (int, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, baseURL()+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var decoded map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &decoded); err != nil {
			// list endpoints may return arrays
			var arr []any
			if err2 := json.Unmarshal(raw, &arr); err2 == nil {
				return resp.StatusCode, map[string]any{"_array": arr}
			}
			t.Fatalf("decode %s %s (%d): %v body=%s", method, path, resp.StatusCode, err, string(raw))
		}
	}
	return resp.StatusCode, decoded
}

func TestE2E_HealthAndPing(t *testing.T) {
	waitHealthy(t)

	status, _ := doJSON(t, http.MethodGet, "/healthz", nil, "")
	if status != http.StatusOK {
		t.Fatalf("healthz: want 200, got %d", status)
	}

	status, body := doJSON(t, http.MethodGet, "/api/v1/ping", nil, "")
	if status != http.StatusOK {
		t.Fatalf("ping: want 200, got %d body=%v", status, body)
	}
}

func TestE2E_AuthItemOfferFlow(t *testing.T) {
	waitHealthy(t)

	email := fmt.Sprintf("e2e-%d@example.com", time.Now().UnixNano())
	password := "password123"

	status, reg := doJSON(t, http.MethodPost, "/api/v1/auth/register", map[string]any{
		"fullName": "E2E User",
		"email":    email,
		"password": password,
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("register: want 201, got %d body=%v", status, reg)
	}
	token, _ := reg["token"].(string)
	if token == "" {
		t.Fatalf("register: empty token: %v", reg)
	}

	status, me := doJSON(t, http.MethodGet, "/api/v1/auth/me", nil, token)
	if status != http.StatusOK {
		t.Fatalf("me: want 200, got %d body=%v", status, me)
	}
	if me["email"] != email {
		t.Fatalf("me: email=%v want %s", me["email"], email)
	}

	status, item := doJSON(t, http.MethodPost, "/api/v1/items", map[string]any{
		"title":       "E2E Bike",
		"description": "Almost new",
		"category":    "sport",
	}, token)
	if status != http.StatusCreated {
		t.Fatalf("create item: want 201, got %d body=%v", status, item)
	}
	itemID, ok := item["id"].(float64)
	if !ok || itemID < 1 {
		t.Fatalf("create item: bad id: %v", item)
	}

	status, list := doJSON(t, http.MethodGet, "/api/v1/items", nil, token)
	if status != http.StatusOK {
		t.Fatalf("list items: want 200, got %d body=%v", status, list)
	}
	total, _ := list["total"].(float64)
	if total < 1 {
		t.Fatalf("list items: total=%v", list["total"])
	}

	status, offer := doJSON(t, http.MethodPost, "/api/v1/exchange-offers", map[string]any{
		"offeredItemId":     int64(itemID),
		"wantedDescription": "Looking for a skateboard",
		"wantedCategory":    "sport",
	}, token)
	if status != http.StatusCreated {
		t.Fatalf("create offer: want 201, got %d body=%v", status, offer)
	}

	status, offers := doJSON(t, http.MethodGet, "/api/v1/exchange-offers", nil, token)
	if status != http.StatusOK {
		t.Fatalf("list offers: want 200, got %d body=%v", status, offers)
	}
	arr, _ := offers["_array"].([]any)
	if len(arr) < 1 {
		t.Fatalf("list offers: empty: %v", offers)
	}

	status, login := doJSON(t, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email":    email,
		"password": password,
	}, "")
	if status != http.StatusOK {
		t.Fatalf("login: want 200, got %d body=%v", status, login)
	}
	if login["token"] == "" {
		t.Fatalf("login: empty token: %v", login)
	}

	status, _ = doJSON(t, http.MethodGet, "/api/v1/items", nil, "")
	if status != http.StatusUnauthorized {
		t.Fatalf("items without auth: want 401, got %d", status)
	}
}

func TestE2E_RegisterConflict(t *testing.T) {
	waitHealthy(t)

	email := fmt.Sprintf("e2e-conflict-%d@example.com", time.Now().UnixNano())
	body := map[string]any{
		"fullName": "Conflict User",
		"email":    email,
		"password": "password123",
	}

	status, _ := doJSON(t, http.MethodPost, "/api/v1/auth/register", body, "")
	if status != http.StatusCreated {
		t.Fatalf("first register: want 201, got %d", status)
	}

	status, conflict := doJSON(t, http.MethodPost, "/api/v1/auth/register", body, "")
	if status != http.StatusConflict {
		t.Fatalf("duplicate register: want 409, got %d body=%v", status, conflict)
	}
}
