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
	ErrChainNotFound                = errors.New("цепочка не найдена")
	ErrChainRepositoryNotConfigured = errors.New("репозиторий цепочек не настроен")
	ErrInvalidChainDraft            = errors.New("некорректный черновик цепочки")
	ErrInvalidChainState            = errors.New("invalid chain state: Count must be >= 2 and ApprovedVotes must be in [0, Count]")
	ErrScoreNotConfigured           = errors.New("ranker не подключён: вызовите MatchingFacade.WithRanker(...)")

	ErrInvalidVoteTarget  = errors.New("целевой запрос должен принадлежать следующей позиции цепочки")
	ErrChainVoteForbidden = errors.New("исходная заявка не принадлежит текущему пользователю")
	ErrChainNotCandidate  = errors.New("цепочка больше не принимает ответы кандидатов")

	ErrChainNotProposed          = errors.New("цепочка больше не принимает подтверждения")
	ErrChainConfirmationExpired  = errors.New("срок подтверждения цепочки истёк")
	ErrChainConfirmationNotFound = errors.New("подтверждение участника не найдено")
	ErrChainNotFrozen            = errors.New("цепочка ещё не заморожена")
	ErrRequestInTwoFrozenChains  = errors.New("запрос не может состоять в двух замороженных цепочках")
	ErrChainNotReadyForHandoff   = errors.New("цепочка не готова к передаче товаров")
	ErrHandoffRequestInvalid     = errors.New("заявка не является закреплённым товаром этой цепочки")
	ErrChainReceiptForbidden     = errors.New("только получатель товара может подтвердить его получение")
	ErrChainHandoffPending       = errors.New("передача товара ещё не подтверждена")

	ErrItemNotFound           = errors.New("товар не найден")
	ErrItemForbidden          = errors.New("товар принадлежит другому пользователю")
	ErrItemArchived           = errors.New("архивный товар нельзя изменять")
	ErrCategoryNotFound       = errors.New("категория не найдена")
	ErrItemHasHardReservation = errors.New("у товара есть активная жёсткая бронь")
	ErrTitleRequired          = errors.New("название обязательно")
	ErrTitleTooLong           = errors.New("название превышает максимальную длину")
	ErrDescriptionTooLong     = errors.New("описание превышает максимальную длину")
	ErrInvalidItemStatus      = errors.New("недопустимый статус товара")
	ErrInvalidImageType       = errors.New("неподдерживаемый тип изображения")
	ErrImageTooLarge          = errors.New("изображение превышает максимальный размер")
)
