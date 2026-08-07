package search

import (
	"strconv"
	"strings"
)

// embedLiteral превращает вектор []float32 в строковый литерал pgvector "[0.1,0.2,...]".
// pgx передаёт его как text-параметр, а PostgreSQL неявно приводит к vector.
// Формат вывода максимально компактен (без хвостовых нулей), чтобы не раздувать запрос.
func embedLiteral(vector []float32) string {
	if len(vector) == 0 {
		return "[]"
	}
	parts := make([]string, len(vector))
	for i, v := range vector {
		parts[i] = strconv.FormatFloat(float64(v), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
