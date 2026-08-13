package main

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strconv"
)

func renderCSV(rows []csvRow) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(csvHeader()); err != nil {
		return nil, err
	}
	for _, row := range rows {
		record := make([]string, 0, len(prefixColumns)+len(featureNames))
		record = append(record,
			strconv.Itoa(row.chainID),
			strconv.Itoa(row.rowSeq),
			row.event,
			row.stage,
			row.label,
			fmt.Sprintf("%.4f", row.score),
			row.rawJSON,
		)
		record = append(record, row.feats...)
		if err := w.Write(record); err != nil {
			return nil, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
