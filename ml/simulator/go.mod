// Go-модуль только для ML-симулятора.
// Бэкенд — отдельный модуль backend/; в этот модуль он не входит.
module github.com/Avito-Team-Not-Found/tricky-exchanger-sim

go 1.26

require github.com/Avito-Team-Not-Found/tricky-exchanger v0.0.0

require github.com/dmitryikh/leaves v0.0.0-20230708180554-25d19a787328 // indirect

replace github.com/Avito-Team-Not-Found/tricky-exchanger => ../../backend
