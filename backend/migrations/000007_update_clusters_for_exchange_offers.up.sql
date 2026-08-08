-- Составной первичный ключ уже запрещает дублировать одну пару
-- «кластер — предложение». Отдельное ограничение гарантирует, что
-- предложение состоит не более чем в одном кластере.
--
-- На существующих базах ограничение могло быть добавлено вручную до появления
-- этой migration. В таком случае сохраняем уже существующую уникальность.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'cluster_members'::regclass
          AND conname = 'cluster_members_request_id_key'
    )
    AND to_regclass('cluster_members_request_id_key') IS NULL THEN
        ALTER TABLE cluster_members
            ADD CONSTRAINT cluster_members_request_id_key UNIQUE (request_id);
    END IF;
END $$;
