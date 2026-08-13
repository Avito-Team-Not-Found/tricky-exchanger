// Go-модуль только для ML-симулятора.
// Бэкенд — отдельный модуль backend/; в этот модуль он не входит.
module github.com/Avito-Team-Not-Found/tricky-exchanger-sim

go 1.26

require github.com/Avito-Team-Not-Found/tricky-exchanger v0.0.0

replace github.com/Avito-Team-Not-Found/tricky-exchanger => ../../backend
