package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// TEIClient реализует embedding.Client через HTTP-запрос к TEI.
type TEIClient struct {
	baseURL    string
	httpClient *http.Client
	maxChars   int
}

// NewTEIClient создаёт клиент TEI. baseURL вида "http://tei:80".
// maxChars — максимальная длина входного текста в символах (<=0 = без усечения).
func NewTEIClient(baseURL string, timeout time.Duration, maxChars int) *TEIClient {
	return &TEIClient{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: timeout},
		maxChars:   maxChars,
	}
}

// Embed отправляет текст в POST /embed и возвращает первый вектор ответа.
// Текст усекается до maxChars символов без разрыва UTF-8-последовательности.
func (c *TEIClient) Embed(ctx context.Context, text string) ([]float32, error) {
	trimmed := truncateUTF8(text, c.maxChars)

	payload, err := json.Marshal(map[string]string{"inputs": trimmed})
	if err != nil {
		return nil, fmt.Errorf("tei: marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/embed", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("tei: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tei: do: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("tei: status %d: %s", resp.StatusCode, body)
	}

	var out [][]float32
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&out); err != nil {
		return nil, fmt.Errorf("tei: decode: %w", err)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("tei: empty embeddings")
	}
	return out[0], nil
}

// truncateUTF8 обрезает строку до max символов, не разрезая многобайтовые символы.
// Если max <= 0 или длина не превышает max, возвращает переданную строку как есть.
func truncateUTF8(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	// идём по рунам до тех пор, пока не наберём max рун
	n := 0
	for i := range s {
		if n == max {
			return s[:i]
		}
		n++
	}
	return s
}
