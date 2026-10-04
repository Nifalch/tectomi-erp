import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./common/prisma/prisma.module";
import { MailModule } from "./common/mail/mail.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { RolesModule } from "./modules/roles/roles.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { TimeModule } from "./modules/time/time.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { BiometricModule } from "./modules/biometric/biometric.module";
import { LeaveModule } from "./modules/leave/leave.module";
import { HrModule } from "./modules/hr/hr.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { ProposalsModule } from "./modules/proposals/proposals.module";
import { AiModule } from "./modules/ai/ai.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { HolidaysModule } from "./modules/holidays/holidays.module";
import { KnowledgeModule } from "./modules/knowledge/knowledge.module";
import { ActivityModule } from "./modules/activity/activity.module";
import { GoalsModule } from "./modules/goals/goals.module";
import { VendorsModule } from "./modules/vendors/vendors.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { CommunicationsModule } from "./modules/communications/communications.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { SprintsModule } from "./modules/sprints/sprints.module";
import { LabelsModule } from "./modules/labels/labels.module";
import { WikiModule } from "./modules/wiki/wiki.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { DealsModule } from "./modules/deals/deals.module";
import { ActivitiesModule } from "./modules/activities/activities.module";
import { PayrollModule } from "./modules/payroll/payroll.module";
import { PerformanceReviewsModule } from "./modules/performance-reviews/performance-reviews.module";
import { FoundersModule } from "./modules/founders/founders.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { TimesheetsModule } from "./modules/timesheets/timesheets.module";
import { ChartAccountsModule } from "./modules/chart-accounts/chart-accounts.module";
import { ItemsModule } from "./modules/items/items.module";
import { TaxRatesModule } from "./modules/tax-rates/tax-rates.module";
import { OrgSettingsModule } from "./modules/org-settings/org-settings.module";
import { EstimatesModule } from "./modules/estimates/estimates.module";
import { BillsModule } from "./modules/bills/bills.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { CreditNotesModule } from "./modules/credit-notes/credit-notes.module";
import { BankAccountsModule } from "./modules/bank-accounts/bank-accounts.module";
import { JournalEntriesModule } from "./modules/journal-entries/journal-entries.module";
import { RecurringInvoicesModule } from "./modules/recurring-invoices/recurring-invoices.module";
import { RecurringExpensesModule } from "./modules/recurring-expenses/recurring-expenses.module";
import { RecurringTasksModule } from "./modules/recurring-tasks/recurring-tasks.module";
import { ProjectStatusesModule } from "./modules/project-statuses/project-statuses.module";
import { SavedViewsModule } from "./modules/saved-views/saved-views.module";
import { CustomFieldsModule } from "./modules/custom-fields/custom-fields.module";
import { SprintRetrospectiveModule } from "./modules/sprint-retrospective/retrospective.module";
import { ChatModule } from "./modules/chat/chat.module";
import { ProjectExpensesModule } from "./modules/project-expenses/project-expenses.module";
import { ClientPortalModule } from "./modules/client-portal/client-portal.module";
import { CredentialsModule } from "./modules/credentials/credentials.module";
import { MarketingIdeasModule } from "./modules/marketing-ideas/marketing-ideas.module";
import { SocialPostsModule } from "./modules/social-posts/social-posts.module";
import { ProductIdeasModule } from "./modules/product-ideas/product-ideas.module";
import { TeamToolsModule } from "./modules/team-tools/team-tools.module";
import { UserAccessModule } from "./modules/user-access/user-access.module";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Background cron scheduler — drives the notification broadcasts
    // (task-due-soon, project deadline, invoice overdue, holiday alert,
    // etc.) that can't be triggered by an inline event handler.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ClientsModule,
    ProjectsModule,
    TasksModule,
    TimeModule,
    AttendanceModule,
    BiometricModule,
    LeaveModule,
    HrModule,
    FinanceModule,
    InvoicesModule,
    ProposalsModule,
    AiModule,
    ResourcesModule,
    DocumentsModule,
    NotificationsModule,
    ReportsModule,
    DashboardModule,
    LeadsModule,
    HolidaysModule,
    KnowledgeModule,
    ActivityModule,
    GoalsModule,
    VendorsModule,
    CalendarModule,
    OnboardingModule,
    CommunicationsModule,
    TemplatesModule,
    SprintsModule,
    LabelsModule,
    WikiModule,
    ContactsModule,
    DealsModule,
    ActivitiesModule,
    PayrollModule,
    PerformanceReviewsModule,
    FoundersModule,
    AssetsModule,
    AnnouncementsModule,
    TimesheetsModule,
    ChartAccountsModule,
    ItemsModule,
    TaxRatesModule,
    OrgSettingsModule,
    EstimatesModule,
    BillsModule,
    PaymentsModule,
    CreditNotesModule,
    BankAccountsModule,
    JournalEntriesModule,
    RecurringInvoicesModule,
    RecurringExpensesModule,
    RecurringTasksModule,
    ProjectStatusesModule,
    SavedViewsModule,
    CustomFieldsModule,
    SprintRetrospectiveModule,
    ChatModule,
    ProjectExpensesModule,
    ClientPortalModule,
    CredentialsModule,
    MarketingIdeasModule,
    SocialPostsModule,
    ProductIdeasModule,
    TeamToolsModule,
    UserAccessModule,
  ],
})
export class AppModule {}

