package cluster_test

import (
	"testing"

	clusterrepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/cluster"
)

func TestNewRepository(t *testing.T) {
	if clusterrepo.NewRepository(nil) == nil {
		t.Fatal("NewRepository(nil) returned nil")
	}
}
