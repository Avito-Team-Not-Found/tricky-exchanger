package logger

import "github.com/sirupsen/logrus"

// New создаёт логгер приложения с заданным уровнем логирования.
// При некорректном/пустом значении уровня используется info.
//
// Заодно выставляет уровень у стандартного logrus-логгера (если понадобится логирование SQLSTATE).
// и другие пакетные вызовы logrus.WithFields пишут с тем же уровнем, что и app.
func New(level string) *logrus.Logger {
	l := logrus.New()

	lvl, err := logrus.ParseLevel(level)
	if err != nil {
		lvl = logrus.InfoLevel
	}
	l.SetLevel(lvl)
	logrus.SetLevel(lvl)

	return l
}
