-- Составной первичный ключ уже запрещает дублировать одну пару
-- «кластер — предложение». Отдельное ограничение гарантирует, что
-- предложение состоит не более чем в одном кластере.
ALTER TABLE cluster_members
    ADD CONSTRAINT cluster_members_request_id_key UNIQUE (request_id);
