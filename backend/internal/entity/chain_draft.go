package entity

// ChainDraft — найденная, но ещё не сохранённая цепочка кластеров обмена.
// Порядок Participants задаёт позиции кластеров в цикле.
type ChainDraft struct {
	Participants []ChainDraftParticipant
	Score        float64
}

// ChainDraftParticipant описывает одну вершину-кластер.
// RequestID хранит заявку-представителя, через которую поиск пришёл в кластер.
// Идентичность вершины и цепочки определяется только по ClusterID.
type ChainDraftParticipant struct {
	ClusterID int64
	RequestID int64
}
