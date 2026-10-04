export function serializeProject(p: any) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
  };
}

export function serializeMilestone(m: any) {
  return { id: m.id, title: m.title, dueDate: m.dueDate ?? null, status: m.status };
}

export function serializeTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate ?? null,
    priority: t.priority ?? null,
  };
}

export function serializeInvoice(i: any) {
  return {
    id: i.id,
    number: i.invoiceNumber,
    issueDate: i.createdAt,
    dueDate: i.dueDate,
    total: i.total,
    status: i.status,
  };
}

export function serializeProposal(p: any) {
  return {
    id: p.id,
    title: p.projectName,
    sentAt: p.status === "DRAFT" ? null : p.updatedAt,
    status: p.status,
    validUntil: p.validUntil ?? null,
  };
}

export function serializeRequest(r: any) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    projectId: r.projectId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function serializeRequestMessage(m: any) {
  const staffName =
    m.authorUser
      ? [m.authorUser.firstName, m.authorUser.lastName].filter(Boolean).join(" ") || null
      : null;
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    author: m.authorContactId
      ? { kind: "contact", id: m.authorContactId, name: m.authorContact?.name ?? null }
      : { kind: "staff", id: m.authorUserId, name: staffName },
  };
}
