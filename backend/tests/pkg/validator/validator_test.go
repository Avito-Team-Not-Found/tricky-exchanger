package validator_test

import (
	"errors"

	"net/http"
	"strings"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"

	"github.com/stretchr/testify/require"
)

type testRequest struct {
	RequiredParam string `json:"required_param" validate:"required"`
	Version       string `json:"version" validate:"omitempty,tag"`
}

type testGetRequest struct {
	RequiredParam string `schema:"required_param" validate:"required"`
}

func TestBindJSON_POSTRequiredParam(t *testing.T) {
	r, err := http.NewRequest(http.MethodPost, "", strings.NewReader(`{"required_param": ""}`))
	require.NoError(t, err)

	req := testRequest{}
	err = validator.BindJSON(&req, r)
	require.Error(t, err)

	var e validator.Error
	ok := errors.As(err, &e)
	require.True(t, ok)
	require.Equal(t, "required_param=required", e.Error())

	r, err = http.NewRequest(http.MethodPost, "", strings.NewReader(`{"required_param": "val"}`))
	require.NoError(t, err)

	err = validator.BindJSON(&req, r)
	require.NoError(t, err)
	require.Equal(t, "val", req.RequiredParam)
}

func TestBindJSON_GETRequiredParam(t *testing.T) {
	r, err := http.NewRequest(http.MethodGet, "required_param=", nil)
	require.NoError(t, err)

	req := testGetRequest{}
	err = validator.BindJSON(&req, r)
	require.Error(t, err)

	var e validator.Error
	ok := errors.As(err, &e)
	require.True(t, ok)
	require.Equal(t, "required_param=required", e.Error())

	r, err = http.NewRequest(http.MethodGet, "?required_param=qwe&path=123", nil)
	require.NoError(t, err)

	err = validator.BindJSON(&req, r)
	require.NoError(t, err)
	require.Equal(t, "qwe", req.RequiredParam)
}

func TestValidate_NotEmptyAndRecoveryCode(t *testing.T) {
	type body struct {
		Title string `json:"title" validate:"not_empty"`
		Code  string `json:"code" validate:"recovery_code"`
	}

	err := validator.Validate(&body{Title: "   ", Code: "123456"})
	require.Error(t, err)

	err = validator.Validate(&body{Title: "ok", Code: "12ab56"})
	require.Error(t, err)

	err = validator.Validate(&body{Title: "ok", Code: "123456"})
	require.NoError(t, err)
}

func TestBindQuery(t *testing.T) {
	type query struct {
		Version int64 `schema:"version" validate:"required,gt=0"`
	}

	r, err := http.NewRequest(http.MethodDelete, "/x?version=0", nil)
	require.NoError(t, err)

	var q query
	err = validator.BindQuery(&q, r)
	require.Error(t, err)

	r, err = http.NewRequest(http.MethodDelete, "/x?version=3", nil)
	require.NoError(t, err)
	err = validator.BindQuery(&q, r)
	require.NoError(t, err)
	require.Equal(t, int64(3), q.Version)
}
