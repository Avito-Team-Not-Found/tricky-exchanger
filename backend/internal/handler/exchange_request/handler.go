package exchange_request

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
	requestservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_request"
)

// Handler обрабатывает HTTP-запросы CRUD заявок на обмен.
// Идентификатор пользователя берётся только из JWT-мидлвари, а не из тела запроса.
type Handler struct {
	service requestservice.ExchangeRequestService
}

func NewHandler(service requestservice.ExchangeRequestService) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(group *gin.RouterGroup) {
	group.POST("", h.Create)
	group.GET("", h.List)
	group.GET("/:id", h.Get)
	group.PUT("/:id", h.Update)
	group.DELETE("/:id", h.Delete)
}

type mutationBody struct {
	OfferedItemID     int64  `json:"offeredItemId" binding:"required"`
	WantedDescription string `json:"wantedDescription" binding:"required"`
	Version           int64  `json:"version"`
}

func (h *Handler) Create(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	var body mutationBody
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusUnprocessableEntity, "invalid request body")
		return
	}

	created, err := h.service.Create(c.Request.Context(), userID, requestservice.CreateInput{
		OfferedItemID:     body.OfferedItemID,
		WantedDescription: body.WantedDescription,
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusCreated, newRequestResponse(created))
}

func (h *Handler) Get(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	requestID, ok := pathID(c)
	if !ok {
		return
	}

	request, err := h.service.Get(c.Request.Context(), userID, requestID)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, newRequestResponse(request))
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	requests, err := h.service.List(c.Request.Context(), userID)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	response := make([]listResponse, 0, len(requests))
	for _, request := range requests {
		response = append(response, listResponse{
			requestResponse:  newRequestResponse(request.ExchangeRequest),
			OfferedItemTitle: request.OfferedItemTitle,
		})
	}

	c.JSON(http.StatusOK, response)
}

func (h *Handler) Update(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	requestID, ok := pathID(c)
	if !ok {
		return
	}

	var body mutationBody
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusUnprocessableEntity, "invalid request body")
		return
	}

	updated, err := h.service.Update(c.Request.Context(), userID, requestID, requestservice.UpdateInput{
		OfferedItemID:     body.OfferedItemID,
		WantedDescription: body.WantedDescription,
		Version:           body.Version,
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, newRequestResponse(updated))
}

func (h *Handler) Delete(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	requestID, ok := pathID(c)
	if !ok {
		return
	}

	version, err := strconv.ParseInt(c.Query("version"), 10, 64)
	if err != nil || version <= 0 {
		writeError(c, http.StatusUnprocessableEntity, "version query parameter must be a positive integer")
		return
	}

	if err := h.service.Delete(c.Request.Context(), userID, requestID, version); err != nil {
		writeServiceError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}

type requestResponse struct {
	ID                int64                `json:"id"`
	OfferedItemID     int64                `json:"offeredItemId"`
	WantedDescription string               `json:"wantedDescription"`
	Status            entity.RequestStatus `json:"status"`
	Version           int64                `json:"version"`
	CreatedAt         string               `json:"createdAt"`
	UpdatedAt         string               `json:"updatedAt"`
}

func newRequestResponse(request entity.ExchangeRequest) requestResponse {
	return requestResponse{
		ID:                request.ID,
		OfferedItemID:     request.OfferedItemID,
		WantedDescription: request.WantedDescription,
		Status:            request.Status,
		Version:           request.Version,
		CreatedAt:         request.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:         request.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

type listResponse struct {
	requestResponse
	OfferedItemTitle string `json:"offeredItemTitle"`
}

func currentUserID(c *gin.Context) (string, bool) {
	userID, ok := middleware.UserID(c)
	if !ok {
		writeError(c, http.StatusUnauthorized, "authentication is required")
		return "", false
	}
	return userID.String(), true
}

func pathID(c *gin.Context) (int64, bool) {
	requestID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || requestID <= 0 {
		writeError(c, http.StatusUnprocessableEntity, "id must be a positive integer")
		return 0, false
	}
	return requestID, true
}

func writeServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, entity.ErrExchangeRequestNotFound):
		writeError(c, http.StatusNotFound, err.Error())
	case errors.Is(err, entity.ErrExchangeRequestForbidden):
		writeError(c, http.StatusForbidden, err.Error())
	case errors.Is(err, entity.ErrExchangeRequestVersionConflict):
		writeError(c, http.StatusConflict, err.Error())
	case errors.Is(err, entity.ErrExchangeRequestLocked):
		writeError(c, http.StatusConflict, err.Error())
	case errors.Is(err, entity.ErrOfferedItemUnavailable):
		writeError(c, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, entity.ErrInvalidOfferedItem),
		errors.Is(err, entity.ErrWantedDescriptionRequired),
		errors.Is(err, entity.ErrWantedDescriptionTooLong),
		errors.Is(err, entity.ErrInvalidVersion):
		writeError(c, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(c, http.StatusInternalServerError, "internal server error")
	}
}

func writeError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message, "code": status})
}
