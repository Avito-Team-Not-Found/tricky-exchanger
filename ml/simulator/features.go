package main

// featureNames — колонки фич в CSV, строго в порядке ml/features.json.
var featureNames = []string{
	"match_mean",
	"min_edge",
	"edge_spread",
	"liquidity_min",
	"liquidity_mean",
	"size_spread",
	"count",
	"progress",
	"is_proposed",
	"is_frozen",
	"hours_since_created",
	"hours_in_stage",
	"vote_velocity",
	"category_popularity",
	"category_diversity",
	"reliability_mean",
}

var prefixColumns = []string{
	"chain_id",
	"row_seq",
	"event",
	"stage",
	"label",
	"formula_score",
	"raw_json",
}

func csvHeader() []string {
	header := make([]string, 0, len(prefixColumns)+len(featureNames))
	header = append(header, prefixColumns...)
	header = append(header, featureNames...)
	return header
}
