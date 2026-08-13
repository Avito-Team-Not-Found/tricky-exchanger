package item

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

func (s *Service) UploadImage(ctx context.Context, requesterID uuid.UUID, itemID int64, content io.Reader, size int64, contentType string) (*entity.Item, error) {
	item, err := s.getOwned(ctx, requesterID, itemID)
	if err != nil {
		return nil, err
	}

	if item.Status == entity.ItemStatusArchived {
		return nil, entity.ErrItemArchived
	}

	if err := s.ensureNoHardReservation(ctx, itemID); err != nil {
		return nil, err
	}

	ext, ok := imageExtensionByContentType[contentType]
	if !ok {
		return nil, entity.ErrInvalidImageType
	}
	if size <= 0 || size > maxImageSize {
		return nil, entity.ErrImageTooLarge
	}

	objectName := fmt.Sprintf("items/%d/%s%s", itemID, uuid.NewString(), ext)
	url, err := s.storage.Upload(ctx, objectName, content, size, contentType)
	if err != nil {
		return nil, err
	}

	if err := s.repo.UpdateImageURL(ctx, itemID, url); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, entity.ErrItemNotFound
		}
		return nil, err
	}

	item.ImageURL = &url
	return item, nil
}
