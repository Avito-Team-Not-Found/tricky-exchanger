package search

// constQueryOutgoing — поиск предметов, близких к want_embedding.
// Параметры: $1 вектор, $2 исключаемый пользователь, $3 порог | $4 = k.
//
// Причина фильтров:
//   - i.status='ACTIVE' и er.status='ACTIVE' — недоступные (заблокированные/архивные)
//     предметы и заявки исключаются сразу на SQL: совпадения в них искать нельзя
//     (критерий приёмки "в недоступных заявках совпадения не ищутся").
//   - er.user_id <> $2 — не показываем человеку его собственные предметы.
//   - i.embedding IS NOT NULL — без вектора не с чем сравнивать.
//
// ORDER BY i.embedding <=> $1 ранжирует по близости; оператор <=> (cosine distance)
// согласован с HNSW-индексом idx_items_embedding (vector_cosine_ops).
// Подобие считается как 1 - distance.
const constQueryOutgoingThreshold = `
	SELECT er.id AS request_id, i.id AS item_id, er.user_id AS owner_id,
	       1 - (i.embedding <=> $1) AS score
	FROM items i
	JOIN exchange_offers er ON er.offered_item_id = i.id
	WHERE i.status = 'ACTIVE'
	  AND er.status = 'ACTIVE'
	  AND er.user_id <> $2
	  AND i.embedding IS NOT NULL
	  AND 1 - (i.embedding <=> $1) >= $3
	ORDER BY i.embedding <=> $1
`

const constQueryOutgoingTopK = `
	SELECT er.id AS request_id, i.id AS item_id, er.user_id AS owner_id,
	       1 - (i.embedding <=> $1) AS score
	FROM items i
	JOIN exchange_offers er ON er.offered_item_id = i.id
	WHERE i.status = 'ACTIVE'
	  AND er.status = 'ACTIVE'
	  AND er.user_id <> $2
	  AND i.embedding IS NOT NULL
	ORDER BY i.embedding <=> $1
	LIMIT $3
`

// constQueryIncoming* — поиск заявок, чей want_embedding близок к предмету.
// Параметры: $1 вектор, $2 исключаемый пользователь, $3 порог | $4 = k.
// Аналогичные фильтры недоступности и исключение себя; ORDER BY по индексу
// idx_er_want_embedding (vector_cosine_ops).
const constQueryIncomingThreshold = `
	SELECT er.id AS request_id, er.offered_item_id AS item_id, er.user_id AS owner_id,
	       1 - (er.want_embedding <=> $1) AS score
	FROM exchange_offers er
	JOIN items oi ON oi.id = er.offered_item_id
	WHERE er.status = 'ACTIVE'
	  AND er.want_embedding IS NOT NULL
	  AND er.user_id <> $2
	  AND oi.status = 'ACTIVE'
	  AND 1 - (er.want_embedding <=> $1) >= $3
	ORDER BY er.want_embedding <=> $1
`

const constQueryIncomingTopK = `
	SELECT er.id AS request_id, er.offered_item_id AS item_id, er.user_id AS owner_id,
	       1 - (er.want_embedding <=> $1) AS score
	FROM exchange_offers er
	JOIN items oi ON oi.id = er.offered_item_id
	WHERE er.status = 'ACTIVE'
	  AND er.want_embedding IS NOT NULL
	  AND er.user_id <> $2
	  AND oi.status = 'ACTIVE'
	ORDER BY er.want_embedding <=> $1
	LIMIT $3
`

// querySimilarOffers ищет заявки с тем же направлением обмена:
// одновременно похожи и отдаваемый товар, и описание желаемого товара.
// Сначала HNSW-индекс ограничивает выборку ближайшими отдаваемыми товарами,
// затем внутри Top-K применяется второй порог по want_embedding.
const querySimilarOffers = `
	WITH nearest_by_offer AS MATERIALIZED (
		SELECT eo.id AS request_id,
		       eo.offered_item_id AS item_id,
		       eo.user_id AS owner_id,
		       1 - (i.embedding <=> $1::vector) AS offer_score,
		       1 - (eo.want_embedding <=> $2::vector) AS want_score,
		       1 - (i.embedding <=> $2::vector) AS offer_to_want_score,
		       1 - (eo.want_embedding <=> $1::vector) AS want_to_offer_score
		FROM exchange_offers AS eo
		JOIN items AS i ON i.id = eo.offered_item_id
		WHERE eo.status = 'ACTIVE'
		  AND i.status = 'ACTIVE'
		  AND eo.id <> $3
		  AND COALESCE(i.category, '') IS NOT DISTINCT FROM COALESCE($4, '')
		  AND COALESCE(eo.wanted_category, '') IS NOT DISTINCT FROM COALESCE($5, '')
		  AND i.embedding IS NOT NULL
		  AND eo.want_embedding IS NOT NULL
		ORDER BY i.embedding <=> $1::vector
		LIMIT $7
	)
	SELECT request_id, item_id, owner_id,
	       LEAST(offer_score, want_score) AS score
	FROM nearest_by_offer
	WHERE offer_score >= $6::float8 - $8::float8
	  AND want_score >= $6::float8 - $8::float8
	  AND (offer_score + want_score) / 2 >= $6::float8
	  -- Category equality is necessary, but it does not prove that two offers
	  -- have the same direction. For example, "AULA -> Red Square" and
	  -- "Red Square -> AULA" both belong to the keyboards category, yet they
	  -- are reciprocal requests and must stay in separate graph vertices.
	  AND (offer_score + want_score) / 2 >=
	      (offer_to_want_score + want_to_offer_score) / 2 + $8
	ORDER BY offer_score + want_score DESC, request_id
`

// queryOutgoingFrontier загружает Top-K исходящих рёбер сразу для всего frontier.
// Frontier состоит из опорных заявок, но вершины DFS — кластеры. Поэтому сначала
// раскрываются все активные заявки кластеров frontier, иначе путь мог бы зависеть
// от случайно выбранного представителя кластера.
// Если wanted_category задана, ребро допускается только к товару той же категории.
const queryOutgoingFrontier = `
	WITH source_clusters AS (
		SELECT DISTINCT member.cluster_id
		FROM cluster_members AS member
		WHERE member.request_id = ANY($1::bigint[])
	)
	SELECT source.id AS from_request_id,
	       source_member.cluster_id AS from_cluster_id,
	       source.user_id::text AS from_owner_id,
	       candidate.request_id AS to_request_id,
	       candidate.cluster_id AS to_cluster_id,
	       candidate.owner_id,
	       candidate.score
	FROM source_clusters AS source_cluster
	JOIN cluster_members AS source_member ON source_member.cluster_id = source_cluster.cluster_id
	JOIN exchange_offers AS source ON source.id = source_member.request_id
	JOIN items AS source_item ON source_item.id = source.offered_item_id
	JOIN LATERAL (
		SELECT target.id AS request_id,
		       target_member.cluster_id,
		       target.user_id::text AS owner_id,
		       1 - (target_item.embedding <=> source.want_embedding) AS score
		FROM exchange_offers AS target
		JOIN items AS target_item ON target_item.id = target.offered_item_id
		JOIN cluster_members AS target_member ON target_member.request_id = target.id
		WHERE target.status = 'ACTIVE'
		  AND target_item.status = 'ACTIVE'
		  AND target_item.embedding IS NOT NULL
		  AND target.user_id <> source.user_id
		  AND target.id <> source.id
		  AND (
			  COALESCE(source.wanted_category, '') = ''
			  OR COALESCE(target_item.category, '') IS NOT DISTINCT FROM source.wanted_category
		  )
		  AND 1 - (target_item.embedding <=> source.want_embedding) >= $3
		ORDER BY target_item.embedding <=> source.want_embedding
		LIMIT $2
	) AS candidate ON true
	WHERE source.status = 'ACTIVE'
	  AND source_item.status = 'ACTIVE'
	  AND source.want_embedding IS NOT NULL
	ORDER BY source.id, candidate.score DESC, candidate.request_id
`

// queryIncomingToStart ищет заявки, которые могут получить любой товар стартового
// кластера. Полученное множество используется как проверка замыкающего ребра,
// поэтому DFS не загружает пятый уровень размером K^5.
// У заявки, замыкающей цикл, заданная wanted_category также должна совпадать
// с категорией отдаваемого товара выбранного участника стартового кластера.
const queryIncomingToStart = `
	WITH start_request AS MATERIALIZED (
		SELECT start.id, start.user_id, start_item.embedding, start_item.category,
		       start_member.cluster_id
		FROM exchange_offers AS start
		JOIN items AS start_item ON start_item.id = start.offered_item_id
		JOIN cluster_members AS start_member ON start_member.request_id = start.id
		WHERE start.id = $1
		  AND start.status = 'ACTIVE'
		  AND start_item.status = 'ACTIVE'
		  AND start_item.embedding IS NOT NULL
	)
	SELECT candidate.id AS from_request_id,
	       candidate_member.cluster_id AS from_cluster_id,
	       candidate.user_id::text AS from_owner_id,
	       start_request.id AS to_request_id,
	       start_request.cluster_id AS to_cluster_id,
	       start_request.user_id::text AS owner_id,
	       1 - (candidate.want_embedding <=> start_request.embedding) AS score
	FROM start_request
	JOIN exchange_offers AS candidate ON candidate.status = 'ACTIVE'
	JOIN items AS candidate_item ON candidate_item.id = candidate.offered_item_id
	JOIN cluster_members AS candidate_member ON candidate_member.request_id = candidate.id
	WHERE candidate_member.cluster_id <> start_request.cluster_id
	  AND candidate.user_id <> start_request.user_id
	  AND candidate_item.status = 'ACTIVE'
	  AND candidate.want_embedding IS NOT NULL
	  AND (
		  COALESCE(candidate.wanted_category, '') = ''
		  OR COALESCE(start_request.category, '') IS NOT DISTINCT FROM candidate.wanted_category
	  )
	  AND 1 - (candidate.want_embedding <=> start_request.embedding) >= $3
	ORDER BY score DESC, candidate.id
	LIMIT $2
`
