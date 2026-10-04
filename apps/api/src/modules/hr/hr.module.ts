import { Module } from "@nestjs/common";
import { AttendanceModule } from "../attendance/attendance.module";
import { DocumentsModule } from "../documents/documents.module";
import { LeaveModule } from "../leave/leave.module";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { PayrollModule } from "../payroll/payroll.module";
import { PerformanceReviewsModule } from "../performance-reviews/performance-reviews.module";
import { EmployeeProfileController } from "./employee-profile/employee-profile.controller";
import { EmployeeProfileService } from "./employee-profile/employee-profile.service";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { HubController } from "./hub/hub.controller";
import { HubService } from "./hub/hub.service";
import { HrPermissionsService } from "./permissions/hr-permissions.service";

@Module({
  imports: [
    AttendanceModule,
    LeaveModule,
    PerformanceReviewsModule,
    PayrollModule,
    OnboardingModule,
    DocumentsModule,
  ],
  controllers: [HrController, EmployeeProfileController, HubController],
  providers: [HrService, HrPermissionsService, EmployeeProfileService, HubService],
  exports: [HrPermissionsService],
})
export class HrModule {}
