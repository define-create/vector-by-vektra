-- Add new AuditActionType enum values.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction.
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'delete_player';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'unclaim_profile';
