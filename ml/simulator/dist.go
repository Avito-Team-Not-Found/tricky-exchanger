package main

import (
	"math"
	"math/rand"
)

func clip(x, lo, hi float64) float64 {
	if x < lo {
		return lo
	}
	if x > hi {
		return hi
	}
	return x
}

func clipInt(x, lo, hi int) int {
	if x < lo {
		return lo
	}
	if x > hi {
		return hi
	}
	return x
}

func bernoulli(rng *rand.Rand, p float64) bool {
	return rng.Float64() < p
}

// expSample returns Exp(rate) draw (mean 1/rate). rate <= 0 → +Inf.
func expSample(rng *rand.Rand, rate float64) float64 {
	if rate <= 0 || math.IsInf(rate, 0) || math.IsNaN(rate) {
		return math.Inf(1)
	}
	u := rng.Float64()
	if u < 1e-15 {
		u = 1e-15
	}
	return -math.Log(u) / rate
}

// normSample is Box–Muller N(0, 1). Always consumes two uniforms.
func normSample(rng *rand.Rand) float64 {
	u1 := rng.Float64()
	u2 := rng.Float64()
	if u1 < 1e-15 {
		u1 = 1e-15
	}
	return math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
}

func normSigma(rng *rand.Rand, sigma float64) float64 {
	return sigma * normSample(rng)
}

// gamma2 is Gamma(2, 1) = Exp(1)+Exp(1).
func gamma2(rng *rand.Rand) float64 {
	return expSample(rng, 1) + expSample(rng, 1)
}

// beta22 is Beta(2, 2) via two Gamma(2, 1).
func beta22(rng *rand.Rand) float64 {
	a := gamma2(rng)
	b := gamma2(rng)
	s := a + b
	if s == 0 {
		return 0.5
	}
	return a / s
}

// poissonKnuth draws Poisson(lambda). lambda <= 0 → 0.
func poissonKnuth(rng *rand.Rand, lambda float64) int {
	if lambda <= 0 {
		return 0
	}
	l := math.Exp(-lambda)
	k := 0
	p := 1.0
	for {
		k++
		p *= rng.Float64()
		if p <= l {
			return k - 1
		}
	}
}

func minFloat(xs []float64) float64 {
	m := xs[0]
	for _, x := range xs[1:] {
		if x < m {
			m = x
		}
	}
	return m
}

func maxFloat(xs []float64) float64 {
	m := xs[0]
	for _, x := range xs[1:] {
		if x > m {
			m = x
		}
	}
	return m
}

func meanFloat(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	var s float64
	for _, x := range xs {
		s += x
	}
	return s / float64(len(xs))
}

func minInt(xs []int) int {
	m := xs[0]
	for _, x := range xs[1:] {
		if x < m {
			m = x
		}
	}
	return m
}

func maxInt(xs []int) int {
	m := xs[0]
	for _, x := range xs[1:] {
		if x > m {
			m = x
		}
	}
	return m
}

func meanInt(xs []int) float64 {
	if len(xs) == 0 {
		return 0
	}
	var s float64
	for _, x := range xs {
		s += float64(x)
	}
	return s / float64(len(xs))
}

func uniqueCount(xs []string) int {
	seen := make(map[string]struct{}, len(xs))
	for _, x := range xs {
		seen[x] = struct{}{}
	}
	return len(seen)
}

func repeatFloat(v float64, n int) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = v
	}
	return out
}
