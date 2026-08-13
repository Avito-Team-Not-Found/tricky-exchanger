package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/config"
	database "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/router"
	chainHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/chain"
	exchangeOfferHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/exchange_offer"
	itemHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/item"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/chainnotification"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/embedding"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/mailer"
	chainRepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/chain"
	clusterRepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/cluster"
	exchangeOfferRepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/exchange_offer"
	itemRepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/item"
	searchRepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/search"
	userRepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/user"
	chainservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/chain"
	clusterservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/cluster"
	exchangeOfferService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_offer"
	itemService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/matching"
	userService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/user"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/codestore"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/storage"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/token"
)

// buildServer собирает зависимости и HTTP-сервер. cleanup закрывает пул БД.
func buildServer(ctx context.Context, cfg *config.Config, logger *logrus.Logger) (*http.Server, func(), error) {
	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("db connect: %w", err)
	}
	logger.Info("connected to PostgreSQL, pgvector OK")

	cleanup := func() {
		pool.Close()
	}

	pingHandler := router.NewPingHandler()

	tokenService := token.NewService(cfg.JWTSecret, cfg.JWTTokenTTL)
	userRepository := userRepo.NewRepository(pool)
	codeStore := codestore.New()
	mailerSvc := mailer.NewService(mailer.Config{
		Host:       cfg.SMTPHost,
		Port:       cfg.SMTPPort,
		Username:   cfg.SMTPUsername,
		Password:   cfg.SMTPPassword,
		From:       cfg.SMTPFrom,
		Encryption: mailer.Encryption(cfg.SMTPEncryption),
	})
	userSvc := userService.NewService(userRepository, tokenService, codeStore, mailerSvc, cfg.RecoveryCodeTTL)
	userH := userHandler.NewHandler(userSvc)

	exchangeOfferRepository := exchangeOfferRepo.NewRepository(pool)
	clusterRepository := clusterRepo.NewRepository(pool)
	candidateSearch := searchRepo.New(pool)
	clusterSvc := clusterservice.NewService(
		clusterRepository,
		candidateSearch,
		cfg.ClusterTopK,
		cfg.ClusterThreshold,
		cfg.ClusterDirectionMargin,
	)
	cycleFinder := matching.NewCycleFinder(
		candidateSearch,
		cfg.CycleOutgoingK,
		cfg.CycleMaxDrafts,
		cfg.MatchingThreshold,
	).WithQualityRules(cfg.CycleMinAverageScore, cfg.CycleMaxScoreGap)
	transactionManager := database.NewTransactionManager(pool)
	chainRepository := chainRepo.NewRepository(pool, cfg.MatchingThreshold)

	scoreRanker, err := matching.NewRuntimeRanker(cfg.RankerMode, cfg.RankerModelPath)
	if err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("ranker init: %w", err)
	}
	chainSvc := chainservice.NewService(chainRepository, transactionManager)
	chainSvc = chainSvc.WithScorer(scoreRanker)
	chainSvc = chainSvc.WithNotifier(chainnotification.New(pool, mailerSvc))

	matchingFacade := matching.NewFacade(clusterSvc, cycleFinder, chainSvc).
		WithRanker(scoreRanker).
		WithRankerContextLoader(chainSvc)
	freezer := chainservice.NewFreezeService(chainRepository, matchingFacade)
	chainSvc = chainSvc.WithFreezer(freezer)

	var embedClient embedding.Client
	switch cfg.EmbeddingProvider {
	case "tei":
		embedClient = embedding.NewTEIClient(cfg.TEIURL, cfg.EmbeddingTimeout, cfg.MaxInputLength)
	case "stub", "":
		embedClient = embedding.NewStubClient()
	default:
		cleanup()
		return nil, nil, fmt.Errorf("unknown embedding provider %q", cfg.EmbeddingProvider)
	}

	exchangeOfferSvc := exchangeOfferService.NewService(
		exchangeOfferRepository,
		embedClient,
		matchingFacade,
		transactionManager,
	)
	exchangeOfferH := exchangeOfferHandler.NewHandler(exchangeOfferSvc)

	publicUseSSL := cfg.MinIOPublicUseSSL
	imageStorage, err := storage.New(ctx, storage.Config{
		Endpoint:       cfg.MinIOEndpoint,
		PublicEndpoint: cfg.MinIOPublicEndpoint,
		AccessKey:      cfg.MinIOAccessKey,
		SecretKey:      cfg.MinIOSecretKey,
		Bucket:         cfg.MinIOBucket,
		UseSSL:         cfg.MinIOUseSSL,
		PublicUseSSL:   &publicUseSSL,
	})
	if err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("minio storage init: %w", err)
	}

	itemRepository := itemRepo.NewRepository(pool)
	itemSvc := itemService.NewService(itemRepository, embedClient, imageStorage)
	itemH := itemHandler.NewHandler(itemSvc)
	chainH := chainHandler.NewHandler(chainSvc)

	engine := router.New(tokenService, pingHandler, userH, exchangeOfferH, itemH, chainH)

	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      engine,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	return srv, cleanup, nil
}
