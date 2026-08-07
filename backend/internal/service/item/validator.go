package item

import "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"

const (
	maxTitleLength       = 200
	maxDescriptionLength = 2000

	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

func validateTitle(title string) error {
	if title == "" {
		return entity.ErrTitleRequired
	}
	if len(title) > maxTitleLength {
		return entity.ErrTitleTooLong
	}
	return nil
}

func validateDescription(description string) error {
	if len(description) > maxDescriptionLength {
		return entity.ErrDescriptionTooLong
	}
	return nil
}

// NormalizePagination подставляет значения по умолчанию и ограничивает pageSize,
// чтобы список товаров нельзя было запросить целиком одним запросом. Экспортируется,
// чтобы handler мог посчитать те же page/pageSize для метаданных ответа.
func NormalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}
