package entity

import "errors"

// Бизнес-ошибки уровня domain/service. Транспортный слой (handler) сам решает,
// в какой HTTP-статус и код их превратить (см. internal/api).
var (
	ErrUserAlreadyExists   = errors.New("user with this email already exists")
	ErrUserNotFound        = errors.New("user not found")
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrInvalidRecoveryCode = errors.New("invalid or expired recovery code")

	ErrExchangeOfferNotFound        = errors.New("заявка на обмен не найдена")
	ErrExchangeOfferForbidden       = errors.New("заявка на обмен принадлежит другому пользователю")
	ErrExchangeOfferVersionConflict = errors.New("заявка на обмен уже была изменена")
	ErrExchangeOfferLocked          = errors.New("заблокированную заявку нельзя изменить или удалить")
	ErrOfferedItemUnavailable       = errors.New("предлагаемый товар недоступен или принадлежит другому пользователю")
	ErrInvalidOfferedItem           = errors.New("идентификатор предлагаемого товара должен быть положительным")
	ErrWantedDescriptionRequired    = errors.New("необходимо описание желаемого товара")
	ErrWantedDescriptionTooLong     = errors.New("описание желаемого товара слишком длинное")
	ErrInvalidVersion               = errors.New("версия должна быть положительной")
	ErrEmbeddingNotConfigured       = errors.New("клиент embeddings не настроен")
	ErrMatchingNotConfigured        = errors.New("фасад matching не настроен")
	ErrEmptyEmbedding               = errors.New("сервис embeddings вернул пустой вектор")
	ErrOfferEmbeddingMissing        = errors.New("для предлагаемого товара не сформирован embedding")
	ErrClusterNotConfigured         = errors.New("сервис кластеризации не настроен")

	ErrItemNotFound           = errors.New("item not found")
	ErrItemForbidden          = errors.New("item belongs to another user")
	ErrItemArchived           = errors.New("item is archived and cannot be modified")
	ErrCategoryNotFound       = errors.New("category not found")
	ErrItemHasHardReservation = errors.New("item has an active hard reservation")
	ErrTitleRequired          = errors.New("title is required")
	ErrTitleTooLong           = errors.New("title exceeds maximum length")
	ErrDescriptionTooLong     = errors.New("description exceeds maximum length")
	ErrInvalidItemStatus      = errors.New("invalid item status")
	ErrInvalidImageType       = errors.New("unsupported image content type")
	ErrImageTooLarge          = errors.New("image exceeds maximum size")
)
