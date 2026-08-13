# ADR 0001: Matching и векторный поиск

## Context

Каждая заявка имеет два вектора: «отдаю» (`items.embedding`) и «хочу» (`exchange_offers.want_embedding`).
Нужны и рёбра графа обмена, и кластеры «того же направления».

## Decision

- **Рёбра графа (циклы):** want → чужой item (outgoing) и item → чужой want (incoming).
- **Кластеры:** одновременно похожи offer↔offer и want↔want (`FindSimilarOffers`), плюс совпадение категорий.
- pgvector / SQL делают Top-K и пороги; поиск циклов и кластеризация — в Go.
- Метрика cosine (`<=>`, `vector_cosine_ops`).
- При обходе кластера в frontier раскрываются все ACTIVE-заявки кластера, не один представитель.

## Consequences

SQL-запросы живут в `internal/repository/search`; оркестрация — в `service/matching` и `service/cluster`.
