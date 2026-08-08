package validator

import (
	"regexp"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
)

var snakeCaseReg = regexp.MustCompile("^[a-zA-Z0-9_]+$")
var tagReg = regexp.MustCompile("^v[0-9]+$")
var recoveryCodeReg = regexp.MustCompile(`^\d{6}$`)

func validateNotEmpty(fl validator.FieldLevel) bool {
	return strings.TrimSpace(fl.Field().String()) != ""
}

func validateSnakeCase(fl validator.FieldLevel) bool {
	return snakeCaseReg.MatchString(fl.Field().String())
}

func validateTag(fl validator.FieldLevel) bool {
	return tagReg.MatchString(fl.Field().String())
}

func validateDate(fl validator.FieldLevel) bool {
	_, err := time.Parse(time.DateOnly, fl.Field().String()) //nolint:typecheck
	return err == nil
}

// validateRecoveryCode — ровно 6 цифр (код восстановления пароля).
func validateRecoveryCode(fl validator.FieldLevel) bool {
	return recoveryCodeReg.MatchString(fl.Field().String())
}

// validateItemStatus — статусы, допустимые при ручном Update товара
// (ARCHIVED выставляется отдельной ручкой Archive).
func validateItemStatus(fl validator.FieldLevel) bool {
	switch fl.Field().String() {
	case "ACTIVE", "UNAVAILABLE":
		return true
	default:
		return false
	}
}
