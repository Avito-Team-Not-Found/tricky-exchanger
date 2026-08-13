// Симулятор синтетических историй цепочек (ТЗ-1).
// Не пишет в БД, не импортирует backend/internal — только pkg/ranker и stdlib.
//
//	go run ./ml/simulator -seed 42 -n 10000 -out ml/data/synthetic_v1.csv -report ml/reports/sim_v1.md
package main


import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	seed := flag.Int64("seed", 42, "RNG seed")
	n := flag.Int("n", 10000, "number of chains")
	out := flag.String("out", "ml/data/synthetic_v1.csv", "CSV output path")
	report := flag.String("report", "ml/reports/sim_v1.md", "markdown report path")
	flag.Parse()

	if *n < 1 {
		fatalf("n must be >= 1")
	}

	rows := Generate(*seed, *n)
	csvBytes, err := renderCSV(rows)
	if err != nil {
		fatalf("csv: %v", err)
	}
	csvAgain, err := renderCSV(Generate(*seed, *n))
	if err != nil {
		fatalf("csv rerun: %v", err)
	}

	checks := runChecks(rows, *n, csvBytes, csvAgain)
	reportBody := renderReport(*seed, *n, *out, *report, rows, checks)

	if err := writeFile(*report, []byte(reportBody)); err != nil {
		fatalf("report: %v", err)
	}

	if !allPassed(checks) {
		fmt.Fprintf(os.Stderr, "self-checks failed; CSV not written (see %s)\n", *report)
		for _, c := range checks {
			mark := "PASS"
			if !c.OK {
				mark = "FAIL"
			}
			fmt.Fprintf(os.Stderr, "  [%s] %s: %s\n", mark, c.Name, c.Detail)
		}
		os.Exit(1)
	}

	if err := writeFile(*out, csvBytes); err != nil {
		fatalf("csv write: %v", err)
	}
	fmt.Printf("wrote %s (%d chains, %d rows)\n", *out, *n, len(rows))
	fmt.Printf("wrote %s\n", *report)
}

func writeFile(path string, body []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, body, 0o644)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
