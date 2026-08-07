package exchange_request

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
	requestservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_request"
)

// Handler обрабатывает HTTP-запросы CRUD заявок на обмен.
// Идентификатор пользователя берётся только из JWT-мидлвари, а не из тела запроса.
type Handler struct {
	service exchangeRequestService
}

func NewHandler(service exchangeRequestService) *Handler {
	return &Handler{service: service}
}

type mutationBody struct {
	OfferedItemID     int64  `json:"offeredItemId" binding:"required"`
	WantedDescription string `json:"wantedDescription" binding:"required"`
	Version           int64  `json:"version"`
}

type exchangeOfferResponse struct {
	ID                int64                `json:"id"`
	OfferedItemID     int64                `json:"offeredItemId"`
	WantedDescription string               `json:"wantedDescription"`
	Status            entity.RequestStatus `json:"status"`
	Version           int64                `json:"version"`
	CreatedAt         string               `json:"createdAt"`
	UpdatedAt         string               `json:"updatedAt"`
}

type exchangeOfferListResponse struct {
	exchangeOfferResponse
	OfferedItemTitle string `json:"offeredItemTitle"`
}

func (h *Handler) Create(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	var body mutationBody
	if err := c.ShouldBindJSON(&body); err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "invalid request body")
		return
	}

	created, err := h.service.Create(c.Request.Context(), userID, requestservice.CreateInput{
		OfferedItemID:     body.OfferedItemID,
		WantedDescription: body.WantedDescription,
	})
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrOfferedItemUnavailable),
			errors.Is(err, entity.ErrInvalidOfferedItem),
			errors.Is(err, entity.ErrWantedDescriptionRequired),
			errors.Is(err, entity.ErrWantedDescriptionTooLong):
			api.SendError(c, http.StatusUnprocessableEntity, err.Error())
		default:
			api.SendError(c, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	api.SendOk(c, http.StatusCreated, newExchangeOfferResponse(created))
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
		switch {
		case errors.Is(err, entity.ErrExchangeRequestNotFound):
			api.SendError(c, http.StatusNotFound, err.Error())
		case errors.Is(err, entity.ErrExchangeRequestForbidden):
			api.SendError(c, http.StatusForbidden, err.Error())
		default:
			api.SendError(c, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	api.SendOk(c, http.StatusOK, newExchangeOfferResponse(request))
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	requests, err := h.service.List(c.Request.Context(), userID)
	if err != nil {
		api.SendError(c, http.StatusInternalServerError, "internal server error")
		return
	}

	response := make([]exchangeOfferListResponse, 0, len(requests))
	for _, request := range requests {
		response = append(response, exchangeOfferListResponse{
			exchangeOfferResponse: newExchangeOfferResponse(request.ExchangeOffer),
			OfferedItemTitle:      request.OfferedItemTitle,
		})
	}

	api.SendOk(c, http.StatusOK, response)
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
		api.SendError(c, http.StatusUnprocessableEntity, "invalid request body")
		return
	}

	updated, err := h.service.Update(c.Request.Context(), userID, requestID, requestservice.UpdateInput{
		OfferedItemID:     body.OfferedItemID,
		WantedDescription: body.WantedDescription,
		Version:           body.Version,
	})
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrExchangeRequestNotFound):
			api.SendError(c, http.StatusNotFound, err.Error())
		case errors.Is(err, entity.ErrExchangeRequestForbidden):
			api.SendError(c, http.StatusForbidden, err.Error())
		case errors.Is(err, entity.ErrExchangeRequestVersionConflict),
			errors.Is(err, entity.ErrExchangeRequestLocked):
			api.SendError(c, http.StatusConflict, err.Error())
		case errors.Is(err, entity.ErrOfferedItemUnavailable),
			errors.Is(err, entity.ErrInvalidOfferedItem),
			errors.Is(err, entity.ErrWantedDescriptionRequired),
			errors.Is(err, entity.ErrWantedDescriptionTooLong),
			errors.Is(err, entity.ErrInvalidVersion):
			api.SendError(c, http.StatusUnprocessableEntity, err.Error())
		default:
			api.SendError(c, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	api.SendOk(c, http.StatusOK, newExchangeOfferResponse(updated))
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
		api.SendError(c, http.StatusUnprocessableEntity, "version query parameter must be a positive integer")
		return
	}

	if err := h.service.Delete(c.Request.Context(), userID, requestID, version); err != nil {
		switch {
		case errors.Is(err, entity.ErrExchangeRequestNotFound):
			api.SendError(c, http.StatusNotFound, err.Error())
		case errors.Is(err, entity.ErrExchangeRequestForbidden):
			api.SendError(c, http.StatusForbidden, err.Error())
		case errors.Is(err, entity.ErrExchangeRequestVersionConflict),
			errors.Is(err, entity.ErrExchangeRequestLocked):
			api.SendError(c, http.StatusConflict, err.Error())
		case errors.Is(err, entity.ErrInvalidVersion):
			api.SendError(c, http.StatusUnprocessableEntity, err.Error())
		default:
			api.SendError(c, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	c.Status(http.StatusNoContent)
}

func newExchangeOfferResponse(offer entity.ExchangeOffer) exchangeOfferResponse {
	return exchangeOfferResponse{
		ID:                offer.ID,
		OfferedItemID:     offer.OfferedItemID,
		WantedDescription: offer.WantedDescription,
		Status:            offer.Status,
		Version:           offer.Version,
		CreatedAt:         offer.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:         offer.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func currentUserID(c *gin.Context) (string, bool) {
	userID, ok := middleware.UserID(c)
	if !ok {
		api.SendError(c, http.StatusUnauthorized, "authentication is required")
		return "", false
	}
	return userID.String(), true
}

func pathID(c *gin.Context) (int64, bool) {
	requestID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || requestID <= 0 {
		api.SendError(c, http.StatusUnprocessableEntity, "id must be a positive integer")
		return 0, false
	}
	return requestID, true
}
