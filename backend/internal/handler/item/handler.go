package item

// Handler обрабатывает HTTP-запросы CRUD товаров.
// Владелец берётся только из JWT-мидлвари, а не из тела запроса.
type Handler struct {
	service itemService
}

func NewHandler(service itemService) *Handler {
	return &Handler{service: service}
}
