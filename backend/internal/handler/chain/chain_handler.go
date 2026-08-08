package chain

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

// Handler обрабатывает чтение доступных пользователю цепочек.
type Handler struct {
	service chainService
}

// NewHandler создаёт HTTP-обработчик цепочек.
func NewHandler(service chainService) *Handler {
	return &Handler{service: service}
}

type chainResponse struct {
	ID                   int64                      `json:"id"`
	Status               entity.ChainStatus         `json:"status"`
	Score                float64                    `json:"score"`
	Length               int                        `json:"length"`
	Version              int64                      `json:"version"`
	CurrentRequestID     int64                      `json:"currentRequestId"`
	CurrentPosition      int                        `json:"currentPosition"`
	GivesToPosition      int                        `json:"givesToPosition"`
	ReceivesFromPosition int                        `json:"receivesFromPosition"`
	FreezeDeadlineAt     *string                    `json:"freezeDeadlineAt,omitempty"`
	InvalidReason        *string                    `json:"invalidReason,omitempty"`
	CreatedAt            string                     `json:"createdAt"`
	UpdatedAt            string                     `json:"updatedAt"`
	Participants         []chainParticipantResponse `json:"participants"`
}

type chainParticipantResponse struct {
	ClusterID              int64  `json:"clusterId"`
	RequestID              int64  `json:"requestId"`
	Position               int    `json:"position"`
	IsCurrentUser          bool   `json:"isCurrentUser"`
	OfferedItemID          int64  `json:"offeredItemId"`
	OfferedItemTitle       string `json:"offeredItemTitle"`
	OfferedItemDescription string `json:"offeredItemDescription"`
	WantedDescription      string `json:"wantedDescription"`
}

type exchangeOptionsResponse struct {
	ChainID              int64                    `json:"chainId"`
	Status               entity.ChainStatus       `json:"status"`
	Score                float64                  `json:"score"`
	CurrentRequestID     int64                    `json:"currentRequestId"`
	CurrentPosition      int                      `json:"currentPosition"`
	GivesToPosition      int                      `json:"givesToPosition"`
	ReceivesFromPosition int                      `json:"receivesFromPosition"`
	CurrentOffer         exchangeOptionResponse   `json:"currentOffer"`
	ReceiveOptions       []exchangeOptionResponse `json:"receiveOptions"`
}

type exchangeOptionResponse struct {
	ClusterID         int64  `json:"clusterId"`
	RequestID         int64  `json:"requestId"`
	ItemID            int64  `json:"itemId"`
	Title             string `json:"title"`
	Description       string `json:"description"`
	WantedDescription string `json:"wantedDescription"`
}

// List возвращает актуальные цепочки аутентифицированного участника.
func (h *Handler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	chains, err := h.service.List(c.Request.Context(), userID)
	if err != nil {
		api.SendError(c, http.StatusInternalServerError, "internal server error")
		return
	}

	response := make([]chainResponse, 0, len(chains))
	for _, chain := range chains {
		response = append(response, newChainResponse(chain, userID))
	}
	api.SendOk(c, http.StatusOK, response)
}

// ExchangeOptions возвращает готовые варианты получения для конкретной заявки владельца.
func (h *Handler) ExchangeOptions(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	offerID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || offerID <= 0 {
		api.SendError(c, http.StatusUnprocessableEntity, "id must be a positive integer")
		return
	}

	chains, err := h.service.ListForOffer(c.Request.Context(), userID, offerID)
	if err != nil {
		if errors.Is(err, entity.ErrExchangeOfferNotFound) {
			api.SendError(c, http.StatusNotFound, err.Error())
			return
		}
		api.SendError(c, http.StatusInternalServerError, "internal server error")
		return
	}

	response := make([]exchangeOptionsResponse, 0, len(chains))
	for _, chain := range chains {
		response = append(response, newExchangeOptionsResponse(chain))
	}
	api.SendOk(c, http.StatusOK, response)
}

// Get возвращает подробности цепочки только её участнику.
func (h *Handler) Get(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	chainID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || chainID <= 0 {
		api.SendError(c, http.StatusUnprocessableEntity, "id must be a positive integer")
		return
	}

	chain, err := h.service.Get(c.Request.Context(), userID, chainID)
	if err != nil {
		if errors.Is(err, entity.ErrChainNotFound) {
			api.SendError(c, http.StatusNotFound, err.Error())
			return
		}
		api.SendError(c, http.StatusInternalServerError, "internal server error")
		return
	}
	api.SendOk(c, http.StatusOK, newChainResponse(chain, userID))
}

func newChainResponse(chain entity.Chain, userID string) chainResponse {
	response := chainResponse{
		ID:                   chain.ID,
		Status:               chain.Status,
		Score:                chain.Score,
		Length:               chain.Length,
		Version:              chain.Version,
		CurrentRequestID:     chain.CurrentRequestID,
		CurrentPosition:      chain.CurrentPosition,
		GivesToPosition:      cyclicPosition(chain.CurrentPosition-1, chain.Length),
		ReceivesFromPosition: cyclicPosition(chain.CurrentPosition+1, chain.Length),
		InvalidReason:        chain.InvalidReason,
		CreatedAt:            chain.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:            chain.UpdatedAt.UTC().Format(time.RFC3339),
		Participants:         make([]chainParticipantResponse, 0, len(chain.Participants)),
	}
	if chain.FreezeDeadlineAt != nil {
		value := chain.FreezeDeadlineAt.UTC().Format(time.RFC3339)
		response.FreezeDeadlineAt = &value
	}
	for _, participant := range chain.Participants {
		response.Participants = append(response.Participants, chainParticipantResponse{
			ClusterID:              participant.ClusterID,
			RequestID:              participant.RequestID,
			Position:               participant.Position,
			IsCurrentUser:          participant.OwnerUserID == userID,
			OfferedItemID:          participant.OfferedItemID,
			OfferedItemTitle:       participant.OfferedItemTitle,
			OfferedItemDescription: participant.OfferedItemDescription,
			WantedDescription:      participant.WantedDescription,
		})
	}
	return response
}

func newExchangeOptionsResponse(chain entity.Chain) exchangeOptionsResponse {
	receivesFromPosition := cyclicPosition(chain.CurrentPosition+1, chain.Length)
	response := exchangeOptionsResponse{
		ChainID:              chain.ID,
		Status:               chain.Status,
		Score:                chain.Score,
		CurrentRequestID:     chain.CurrentRequestID,
		CurrentPosition:      chain.CurrentPosition,
		GivesToPosition:      cyclicPosition(chain.CurrentPosition-1, chain.Length),
		ReceivesFromPosition: receivesFromPosition,
		ReceiveOptions:       make([]exchangeOptionResponse, 0),
	}

	for _, participant := range chain.Participants {
		option := exchangeOptionResponse{
			ClusterID:         participant.ClusterID,
			RequestID:         participant.RequestID,
			ItemID:            participant.OfferedItemID,
			Title:             participant.OfferedItemTitle,
			Description:       participant.OfferedItemDescription,
			WantedDescription: participant.WantedDescription,
		}
		if participant.RequestID == chain.CurrentRequestID {
			response.CurrentOffer = option
		}
		if participant.Position == receivesFromPosition {
			response.ReceiveOptions = append(response.ReceiveOptions, option)
		}
	}
	return response
}

func cyclicPosition(position, length int) int {
	if length <= 0 {
		return 0
	}
	return (position%length + length) % length
}

func currentUserID(c *gin.Context) (string, bool) {
	userID, ok := middleware.UserID(c)
	if !ok {
		api.SendError(c, http.StatusUnauthorized, "authentication is required")
		return "", false
	}
	return userID.String(), true
}
