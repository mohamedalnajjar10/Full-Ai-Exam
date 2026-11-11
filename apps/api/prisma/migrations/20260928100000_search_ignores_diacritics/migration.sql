-- البحث النصي بيتجاهل التشكيل والتطويل ويوحّد الألف: الكتب بتطلع من التعرّف
-- الضوئي مشكّلة والطالب بيكتب بدون تشكيل. التعبير لازم يطابق DOC_TSV بـ
-- knowledge-retrieval.service.ts حرفياً حتى Postgres يستعمل الفهرس.
DROP INDEX IF EXISTS "KnowledgeChunk_text_fts_idx";

CREATE INDEX "KnowledgeChunk_search_fts_idx" ON "KnowledgeChunk"
  USING GIN (to_tsvector('simple', translate(coalesce("section", '') || ' ' || "text", 'أإآٱًٌٍَُِّْٰـ', 'اااا')));
