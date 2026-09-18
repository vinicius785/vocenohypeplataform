-- Security audit finding: 5 of 6 Storage buckets had no DB-level
-- file_size_limit at all (only entrega-anexos had one, set previously for
-- video content). Since app-side upload code has no client-side size check
-- either, any authenticated user could upload arbitrarily large files
-- directly via the Storage API, a real storage-cost/abuse vector. 100MB is
-- generous for the actual content these buckets hold (chat/task
-- attachments, financeiro documents, monthly reports, AEO screenshots) and
-- shouldn't affect any legitimate current usage.
update storage.buckets set file_size_limit = 104857600
  where id in ('financeiro-anexos','relatorios-mensais','aeo-evidencias','task-attachments','chat-attachments')
    and file_size_limit is null;
