package entity

// ChainDraft — найденный, но ещё не сохранённый вариант цепочки обмена.
// Порядок Participants задаёт позиции в цикле: участник i получает товар
// следующего участника, а последний получает товар первого.
type ChainDraft struct {
	Participants []ChainDraftParticipant
	Score        float64
}

// ChainDraftParticipant фиксирует выбранную заявку внутри вершины-кластера.
// При быстрой замене request_id можно заменить другим участником того же cluster_id.
type ChainDraftParticipant struct {
	ClusterID int64
	RequestID int64
}
