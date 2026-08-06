package user

// Handler — HTTP-обработчики фичи "пользователи" (регистрация, вход и т.д.).
type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}
