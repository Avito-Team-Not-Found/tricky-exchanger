package logger

import "github.com/sirupsen/logrus"

// New создаёт логгер приложения с заданным уровнем логирования.
// При некорректном/пустом значении уровня используется info.
func New(level string) *logrus.Logger {
	l := logrus.New()

	lvl, err := logrus.ParseLevel(level)
	if err != nil {
		lvl = logrus.InfoLevel
	}
	l.SetLevel(lvl)

	return l
}
