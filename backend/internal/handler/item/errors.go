package item

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

// maxImageUploadSize — тот же лимит, что и в service/item, продублирован здесь,
// чтобы отклонять слишком большие файлы ещё до чтения их в память.
const maxImageUploadSize = 5 << 20

func writeItemError(c *gin.Context, err error) {
	var ve validator.Error
	switch {
	case errors.As(err, &ve):
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, entity.ErrItemNotFound), errors.Is(err, entity.ErrItemForbidden):
		// Чужой и несуществующий товар неразличимы для клиента — не подтверждаем
		// существование чужих товаров.
		api.SendError(c, http.StatusNotFound, "товар не найден")
	case errors.Is(err, entity.ErrItemHasHardReservation):
		api.SendError(c, http.StatusConflict, err.Error())
	case errors.Is(err, entity.ErrItemArchived),
		errors.Is(err, entity.ErrInvalidItemStatus),
		errors.Is(err, entity.ErrInvalidImageType),
		errors.Is(err, entity.ErrImageTooLarge):
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
	default:
		api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
	}
}
