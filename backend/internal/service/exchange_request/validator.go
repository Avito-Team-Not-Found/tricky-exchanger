package exchange_request

import "strings"

import "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"

const maxWantedDescriptionLength = 5_000

func validateCreate(input CreateInput) error {
	if input.OfferedItemID <= 0 {
		return entity.ErrInvalidOfferedItem
	}

	if strings.TrimSpace(input.WantedDescription) == "" {
		return entity.ErrWantedDescriptionRequired
	}

	if len(input.WantedDescription) > maxWantedDescriptionLength {
		return entity.ErrWantedDescriptionTooLong
	}

	return nil
}

func validateUpdate(input UpdateInput) error {
	if err := validateCreate(CreateInput{
		OfferedItemID:     input.OfferedItemID,
		WantedDescription: input.WantedDescription,
	}); err != nil {
		return err
	}

	if input.Version <= 0 {
		return entity.ErrInvalidVersion
	}

	return nil
}
