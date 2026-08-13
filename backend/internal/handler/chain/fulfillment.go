package chain

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
)

// Handoff — временный локальный callback подтверждения передачи (без внешней auth).
func (h *Handler) Handoff(c *gin.Context) {
	var body handoffRequest
	if !api.BindJSON(c, &body) {
		return
	}

	result, err := h.service.Handoff(c.Request.Context(), body.ChainID, body.RequestID)
	if err != nil {
		DetermineError(c, err)
		return
	}
	api.SendOk(c, http.StatusOK, result)
}

func (h *Handler) ConfirmReceipt(c *gin.Context) {
	userID, ok := api.CurrentUserString(c)
	if !ok {
		return
	}
	chainID, ok := api.PathInt64(c, "id")
	if !ok {
		return
	}
	var body receiptRequest
	if !api.BindJSON(c, &body) {
		return
	}

	result, err := h.service.ConfirmReceipt(c.Request.Context(), userID, chainID, body.RequestID)
	if err != nil {
		DetermineError(c, err)
		return
	}
	api.SendOk(c, http.StatusOK, result)
}
