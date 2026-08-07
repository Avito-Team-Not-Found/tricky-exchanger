package user

// Handler — HTTP-обработчики фичи "пользователи" (регистрация, вход и т.д.).
type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// userResponse — публичное представление пользователя, общее для всех ручек фичи.
type userResponse struct {
	ID       string `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

// sessionResponse — ответ ручек, создающих сессию (register, login).
type sessionResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}
