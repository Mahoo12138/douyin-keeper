package asynqworker

import (
	"context"
	"fmt"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func loadPendingMessage(ctx context.Context, loader PayloadLoader, publicID, operation string) (*postgres.PendingMessage, error) {
	message, err := loader.FetchByPublicID(ctx, publicID)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", operation, err)
	}
	if message == nil {
		return nil, fmt.Errorf("%s returned nil", operation)
	}
	return message, nil
}

func requirePendingMessage(message *postgres.PendingMessage, err error, operation string) (*postgres.PendingMessage, error) {
	if err != nil {
		return nil, fmt.Errorf("%s: %w", operation, err)
	}
	if message == nil {
		return nil, fmt.Errorf("%s returned nil", operation)
	}
	return message, nil
}
