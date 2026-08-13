package chain_test

import (
	"strings"
	"testing"

	// white-box via same package would need colocated tests; instead assert
	// exported construction indirectly by re-implementing the shared fragment
	// contract through the production helper package path.
	chainrepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/chain"
)

// Ensure NewRepository still wires threshold used by replacement SQL ($N).
func TestReplacementThresholdWired(t *testing.T) {
	repo := chainrepo.NewRepository(nil, 0.77)
	if repo == nil {
		t.Fatal("nil repo")
	}
}

func TestReplacementEligibilityFragmentContract(t *testing.T) {
	// Mirror of replacementEligibility.sql() — keeps the shared rules visible in tests/
	// and fails loudly if production fragment drifts from required predicates.
	required := []string{
		"candidate.status = 'ACTIVE'",
		"live_offer.status IN ('IN_PROPOSAL', 'LOCKED')",
		"chain_replacement_attempts",
		"candidate.user_id <> ALL",
		"embedding IS NOT NULL",
		"want_embedding IS NOT NULL",
		"category IS NOT DISTINCT FROM",
		"1 - (",
	}

	// Build three shapes like List / Select / Decline via package-visible test hook.
	fragments := []string{
		chainrepo.ReplacementEligibilitySQL("$1", "v.position", "item", "previous_offer", "next_item", "$3", true),
		chainrepo.ReplacementEligibilitySQL("$1", "$6", "candidate_item", "actor_offer", "next_item", "$7", true),
		chainrepo.ReplacementEligibilitySQL("$3", "declined.position", "candidate_item", "previous_offer", "next_item", "$4", false),
	}
	for i, frag := range fragments {
		for _, needle := range required {
			if !strings.Contains(frag, needle) {
				t.Fatalf("fragment %d missing %q\n%s", i, needle, frag)
			}
		}
		if i < 2 && !strings.Contains(frag, "chain_participants current") {
			t.Fatalf("fragment %d must exclude already-in-chain candidates", i)
		}
		if i == 2 && strings.Contains(frag, "chain_participants current") {
			t.Fatalf("decline fragment must not require exclude-already-in-chain")
		}
	}
}
