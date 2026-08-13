package user

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
