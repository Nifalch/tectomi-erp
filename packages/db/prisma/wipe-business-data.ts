/**
 * One-shot "wipe business data" script.
 *
 * Keeps:
 *   - User accounts + their RBAC (User, UserRole, Role, RolePermission,
 *     Permission, UserModuleAccess)
 *   - EmployeeProfile rows (so existing logins still have employee identity)
 *   - OrganizationSettings + OfficeSettings (the company config)
 *   - Currency, TaxRate, ChartAccount, Item, ProjectTaskStatus, Label,
 *     EmailTemplate, OnboardingChecklist defaults (lookup data the seed
 *     populates and the UI assumes is present)
 *
 * Deletes EVERYTHING else — every client, lead, deal, invoice, bill,
 * payment, expense, project, task, sprint, milestone, time entry,
 * attendance, leave request, payroll run, performance cycle/review,
 * proposal, estimate, asset, announcement, chat, notification, the lot.
 *
 * Ordered child → parent so FK cascades don't bite. Run with:
 *   pnpm --filter @nuro/db exec tsx prisma/wipe-business-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Wiping business data — keeping users, roles, permissions, org settings…");

  // 1. Chat + activity + notifications + audit (most-leaf relations).
  await prisma.chatReaction.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.credentialAudit.deleteMany();
  await prisma.credentialAccess.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.credentialFolder.deleteMany();
  await prisma.reportExport.deleteMany();
  await prisma.calendarEvent.deleteMany();

  // 2. Performance reviews
  await prisma.review360Feedback.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.reviewCycle.deleteMany();

  // 3. HR ops — attendance, leave, payroll, shifts, biometric
  await prisma.biometricLog.deleteMany();
  await prisma.biometricDevice.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.shiftSchedule.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.paySlip.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.timesheetSubmission.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.onboardingItem.deleteMany();
  // Keep OnboardingChecklist defaults intact (they're org-level templates).
  await prisma.employmentStatusEvent.deleteMany();
  await prisma.promotionHistory.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.hrNote.deleteMany();
  await prisma.equityGrant.deleteMany();
  await prisma.founderLedgerEntry.deleteMany();
  await prisma.companyValuation.deleteMany();

  // 4. Tasks + sprints + milestones + project structure
  await prisma.sprintBurndownSnapshot.deleteMany();
  await prisma.sprintRetrospective.deleteMany();
  await prisma.taskAttachment.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskWatcher.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.task.deleteMany();
  await prisma.recurringTaskTemplate.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectPaymentMilestone.deleteMany();
  await prisma.projectWikiPage.deleteMany();
  await prisma.projectClientMessage.deleteMany();
  await prisma.projectExpense.deleteMany();
  await prisma.projectMember.deleteMany();
  // Don't drop ProjectTaskStatus defaults — those are org-level kanban columns.
  await prisma.resourceAllocation.deleteMany();
  await prisma.project.deleteMany();
  await prisma.goal.deleteMany();

  // 5. Finance — invoices, bills, payments, expenses, journals, banks
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.creditNoteItem.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.recurringInvoiceItem.deleteMany();
  await prisma.recurringInvoice.deleteMany();
  await prisma.billItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.recurringExpense.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.revenue.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.estimateItem.deleteMany();
  await prisma.estimate.deleteMany();

  // 6. Proposals
  await prisma.proposalAcceptance.deleteMany();
  await prisma.proposalDeliverable.deleteMany();
  await prisma.proposalBlock.deleteMany();
  await prisma.proposal.deleteMany();

  // 7. CRM — clients, leads, deals, contacts, contracts, vendors
  await prisma.contract.deleteMany();
  await prisma.clientRequestMessage.deleteMany();
  await prisma.clientRequest.deleteMany();
  await prisma.clientPortalSession.deleteMany();
  await prisma.clientMagicLink.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.vendor.deleteMany();

  // 8. Studio + knowledge + misc
  await prisma.productIdeaVote.deleteMany();
  await prisma.productIdeaTask.deleteMany();
  await prisma.productIdea.deleteMany();
  await prisma.marketingIdeaTask.deleteMany();
  await prisma.marketingIdea.deleteMany();
  await prisma.socialPost.deleteMany();
  await prisma.teamTool.deleteMany();
  await prisma.knowledgeArticle.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.document.deleteMany();
  await prisma.savedView.deleteMany();

  // 9. Auth ephemera — keep RefreshToken if users are currently logged in
  //    so we don't kick them out, but clear password reset / magic links.
  await prisma.passwordResetToken.deleteMany();
  await prisma.verificationToken.deleteMany();

  console.log("Done. Business data cleared.");

  // Quick summary so the operator can verify counts went to 0.
  const [clients, leads, deals, projects, invoices, bills, payments, expenses, proposals, estimates, cycles, reviews] = await Promise.all([
    prisma.client.count(),
    prisma.lead.count(),
    prisma.deal.count(),
    prisma.project.count(),
    prisma.invoice.count(),
    prisma.bill.count(),
    prisma.payment.count(),
    prisma.expense.count(),
    prisma.proposal.count(),
    prisma.estimate.count(),
    prisma.reviewCycle.count(),
    prisma.performanceReview.count(),
  ]);
  console.table({
    clients, leads, deals, projects, invoices, bills, payments,
    expenses, proposals, estimates, cycles, reviews,
  });

  const [users, roles, permissions] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.permission.count(),
  ]);
  console.log(`Preserved: ${users} users · ${roles} roles · ${permissions} permissions`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
