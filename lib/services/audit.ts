/**
 * Audit service: immutable audit event creation.
 * AuditEvents must NEVER be updated or deleted — only created.
 */

import {
  type PrismaClient,
  type AuditActionType,
  type AuditEntityType,
  Prisma,
} from "@/app/generated/prisma/client";

interface WriteAuditEventParams {
  entityType: AuditEntityType;
  entityId: string;
  actionType: AuditActionType;
  adminUserId?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function writeAuditEvent(
  params: WriteAuditEventParams,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      actionType: params.actionType,
      adminUserId: params.adminUserId ?? null,
      metadata: params.metadata ?? undefined,
    },
  });
}
