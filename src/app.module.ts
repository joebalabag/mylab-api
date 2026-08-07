import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { KnexModule } from './knex/knex.module';
import { MailerModule } from './common/mailer/mailer.module';
import { AuthModule } from './app/auth/auth.module';
import { AdminModule } from './app/admin/admin.module';
import { TenantModule } from './app/tenant/tenant.module';
import { UserModule } from './app/user/user.module';
import { DiscountModule } from './app/discount/discount.module';
import { ItemGroupModule } from './app/item-group/item-group.module';
import { ItemCategoryModule } from './app/item-category/item-category.module';
import { TestItemModule } from './app/test-item/test-item.module';
import { ItemPackageModule } from './app/item-package/item-package.module';
import { PatientModule } from './app/patient/patient.module';
import { PatientCaseModule } from './app/patient-case/patient-case.module';
import { PatientRequisitionModule } from './app/patient-requisition/patient-requisition.module';
import { LabReportModule } from './app/lab-report/lab-report.module';
import { DoctorModule } from './app/doctor/doctor.module';
import { PaymentModule } from './app/payment/payment.module';
import { SubscriptionPlanModule } from './app/subscription-plan/subscription-plan.module';
import { TenantSubscriptionPaymentModule } from './app/tenant-subscription-payment/tenant-subscription-payment.module';
import { TenantSubscriptionHistoryModule } from './app/tenant-subscription-history/tenant-subscription-history.module';
import { ExpenseModule } from './app/expense/expense.module';
import { AccessTemplateModule } from './app/access-template/access-template.module';
import { UserAccessModule } from './app/user-access/user-access.module';
import { TenantRegistrationModule } from './app/tenant-registration/tenant-registration.module';
import { MailTestModule } from './app/mail-test/mail-test.module';
import { AiExtractionModule } from './app/ai-extraction/ai-extraction.module';
import { AnalyticsModule } from './app/analytics/analytics.module';
import { ReportsModule } from './app/reports/reports.module';
import { SetupReadinessModule } from './app/setup-readiness/setup-readiness.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: `.env.${process.env.NODE_ENV || 'local'}`,
		}),
		ScheduleModule.forRoot(),
		ThrottlerModule.forRoot([
			//{ name: 'default', ttl: 60_000, limit: 100 },
			// Named limiter applied per-route with @Throttle({ login: {...} }).
			{ name: 'login', ttl: 60_000, limit: 5 },
		]),
		KnexModule,
		MailerModule,
		AuthModule,
		AdminModule,
		TenantModule,
		UserModule,
		DiscountModule,
		ItemGroupModule,
		ItemCategoryModule,
		TestItemModule,
		ItemPackageModule,
		PatientModule,
		PatientCaseModule,
		PatientRequisitionModule,
		LabReportModule,
		DoctorModule,
		PaymentModule,
		SubscriptionPlanModule,
		TenantSubscriptionPaymentModule,
		TenantSubscriptionHistoryModule,
		ExpenseModule,
		AccessTemplateModule,
		UserAccessModule,
		TenantRegistrationModule,
		MailTestModule,
		AiExtractionModule,
		AnalyticsModule,
		ReportsModule,
		SetupReadinessModule,
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: SubscriptionGuard,
		},
	],
})
export class AppModule {}
