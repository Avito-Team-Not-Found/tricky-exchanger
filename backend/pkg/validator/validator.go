package validator

import (
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/gorilla/schema"
)

var v10 *validator.Validate
var schemaDecoder = schema.NewDecoder()

var customValidators = map[string]func(fl validator.FieldLevel) bool{
	"snake_case":    validateSnakeCase,
	"not_empty":     validateNotEmpty,
	"date":          validateDate,
	"tag":           validateTag,
	"recovery_code": validateRecoveryCode,
	"item_status":   validateItemStatus,
}

func init() {
	v10 = validator.New(validator.WithRequiredStructEnabled())
	schemaDecoder.IgnoreUnknownKeys(true)
	for tag, fn := range customValidators {
		_ = v10.RegisterValidation(tag, fn)
	}
}

// BindJSON декодирует тело (или form/query для GET/multipart) и валидирует object.
// object должен быть указателем на структуру.
func BindJSON(object any, r *http.Request) error {
	if isFormRequest(r) {
		if err := r.ParseForm(); err != nil {
			return err
		}
		if err := schemaDecoder.Decode(object, r.Form); err != nil {
			return err
		}
	} else {
		if err := json.NewDecoder(r.Body).Decode(object); err != nil {
			return err
		}
	}

	return Validate(object)
}

// BindQuery декодирует URL query-параметры и валидирует object.
func BindQuery(object any, r *http.Request) error {
	if err := schemaDecoder.Decode(object, r.URL.Query()); err != nil {
		return err
	}
	return Validate(object)
}

func isFormRequest(r *http.Request) bool {
	return r.Method == http.MethodGet || strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data")
}

// Validate проверяет структуру по тегам validate.
// object должен быть указателем на структуру.
func Validate(object any) error {
	err := v10.Struct(object)
	if err == nil {
		return nil
	}

	var validationErrors validator.ValidationErrors
	ok := errors.As(err, &validationErrors)
	if !ok {
		return Error{
			Msg: err.Error(),
		}
	}

	if len(validationErrors) == 0 {
		return nil
	}

	objectType := reflect.TypeOf(object)
	if objectType.Kind() == reflect.Ptr {
		objectType = objectType.Elem()
	}

	fieldErrors := map[string]string{}
	for _, fieldErr := range validationErrors {
		key := buildPath(objectType, prepareNamespace(fieldErr.Namespace()))
		fieldErrors[key] = fieldErr.Tag()
		if fieldErr.Param() != "" {
			fieldErrors[key] += "=" + fieldErr.Param()
		}
	}

	return Error{
		Fields: fieldErrors,
	}
}

func buildPath(objectType reflect.Type, namespace []string) string {
	field := namespace[0]
	if _, err := strconv.Atoi(field); err == nil {
		if len(namespace) > 1 {
			return field + "." + buildPath(objectType.Elem(), namespace[1:])
		}
		return field
	}

	if objectType.Kind() == reflect.Ptr {
		objectType = objectType.Elem()
	}

	f, _ := objectType.FieldByName(field)
	tag := getJSONTag(f.Tag, f.Name)
	path := tag

	if len(namespace) > 1 {
		path += "." + buildPath(f.Type, namespace[1:])
	}

	return path
}

func prepareNamespace(namespace string) []string {
	namespace = strings.SplitN(namespace, ".", 2)[1]
	namespace = strings.ReplaceAll(strings.ReplaceAll(namespace, "[", "."), "]", "")

	return strings.Split(namespace, ".")
}

func getJSONTag(tag reflect.StructTag, fallback string) string {
	if val, ok := tag.Lookup("schema"); ok && val != "" {
		return val
	}
	if val := strings.Split(tag.Get("json"), ",")[0]; val != "" && val != "-" {
		return val
	}
	return fallback
}
