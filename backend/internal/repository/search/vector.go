package search

import (
	"strconv"
	"strings"
)

// embedLiteral — компактный литерал pgvector "[0.1,0.2,...]" для text-параметра.
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
