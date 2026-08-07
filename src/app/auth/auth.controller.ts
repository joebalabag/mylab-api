import { Body, Controller, ForbiddenException, Post, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { LoginDTO } from './dto/login.dto';
import { UserLoginDTO } from './dto/user-login.dto';
import { VerifyManagerDTO } from './dto/verify-manager.dto';
import { AuthService } from './auth.service';
import { Admin } from '../admin/admin.model';
import { User } from '../user/user.model';
import { SubscriptionPlan } from '../subscription-plan/subscription-plan.model';
import { TenantSubscriptionHistory } from '../tenant-subscription-payment/tenant-subscription-history.model';
import { Tenant } from '../tenant/tenant.model';
import { UserAccessService } from '../user-access/user-access.service';

function buildTenantSubscription(tenant: Tenant, plan?: SubscriptionPlan, scheduled?: TenantSubscriptionHistory | null) {
	const now = new Date();
	const expiry = tenant.current_subscription_expiry ? new Date(tenant.current_subscription_expiry) : null;
	const start = tenant.current_subscription_start ? new Date(tenant.current_subscription_start) : null;
	const warning_days = Number(tenant.current_subscription_expiry_warning_days ?? 7);
	const is_active = !!expiry && expiry > now;
	const days_remaining = is_active
		? Math.ceil((expiry!.getTime() - now.getTime()) / 86_400_000)
		: 0;
	const is_near_expiry = is_active && days_remaining <= warning_days;

	// allowed_modules / max_terminals come off the plan snapshot. When the
	// tenant has no plan (or the plan row was deleted), null the caps so the
	// frontend treats the account as "no POS modules unlocked yet" — safer
	// than defaulting to "everything allowed".
	const allowed_modules = Array.isArray(plan?.allowed_modules) ? plan!.allowed_modules : [];
	const max_terminals = plan?.max_terminals ?? null;

	return {
		plan_uuid: tenant.current_subscription_plan_uuid ?? null,
		plan_code: plan?.code ?? null,
		plan_name: plan?.name ?? null,
		plan_amount: Number(tenant.current_subscription_plan_amount ?? 0),
		days_duration: tenant.current_subscription_days != null ? Number(tenant.current_subscription_days) : null,
		start,
		expiry,
		warning_days,
		is_active,
		days_remaining,
		is_near_expiry,
		allowed_modules,
		max_terminals,
		scheduled: scheduled
			? {
					subscription_plan_uuid: scheduled.subscription_plan_uuid ?? null,
					subscription_plan_code: scheduled.subscription_plan_code,
					subscription_plan_name: scheduled.subscription_plan_name,
					subscription_start: scheduled.subscription_start,
					subscription_end: scheduled.subscription_end,
					subscription_days: Number(scheduled.subscription_days),
				}
			: null,
	};
}

@ApiTags('Auth')
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly userAccessService: UserAccessService,
	) {}

	@Post('/admin/login')
	@Throttle({ login: { limit: 5, ttl: 60_000 } })
	@ApiOperation({ summary: 'Admin - Login (global super admin). Rate-limited to 5 attempts per minute per IP.' })
	@ApiBody({ type: LoginDTO })
	async adminLogin(@Res() res: Response, @Body() data: LoginDTO) {
		try {
			const validation = await this.authService.validateAdminLogin(data.username, data.password);
			if (!validation.isAllowLogin || !validation.admin) {
				return ApiResponseHelper.sendResponse(res, null, validation.message, 401);
			}

			const admin = validation.admin;
			await Admin.query().patch({ last_logindate: new Date() }).where({ uuid: admin.uuid });

			const { access_token } = this.authService.signAdminToken(admin);

			return ApiResponseHelper.sendResponse(
				res,
				{
					access_token,
					type: 'admin',
					uuid: admin.uuid,
					username: admin.username,
					name: admin.name,
					email: admin.email,
					role: admin.role,
					last_logindate: new Date(),
				},
				validation.message
			);
		} catch (error: any) {
			console.error(error);
			return ApiResponseHelper.sendResponse(res, null, error?.message || 'Login failed.', 500);
		}
	}

	@Post('/verify-manager')
	@UseGuards(AuthGuard('jwt'))
	@ApiBearerAuth('access-token')
	@Throttle({ login: { limit: 10, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Auth - Manager override verification. Verifies a supervisor\'s credentials for sensitive actions (void, discount override) without issuing a new token. Requires an active session; the verified user must be an admin or manager of the SAME tenant as the caller. Rate-limited to 10 attempts / minute / IP.',
	})
	@ApiBody({ type: VerifyManagerDTO })
	async verifyManager(
		@Res() res: Response,
		@Body() data: VerifyManagerDTO,
		@CurrentUser() current: any,
	) {
		try {
			if (current?.type !== 'user' || !current?.tenant_uuid) {
				throw new ForbiddenException('Only tenant users can request a manager override.');
			}
			const check = await this.authService.validateManagerOverride(
				data.username,
				data.password,
				current.tenant_uuid,
			);
			if (!check.ok || !check.user) {
				return ApiResponseHelper.sendResponse(res, null, check.message, 401);
			}
			return ApiResponseHelper.sendResponse(
				res,
				{
					uuid: check.user.uuid,
					username: check.user.username,
					name: check.user.name,
					role: check.user.role,
				},
				check.message,
			);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message || 'Verification failed.', error?.status ?? 500);
		}
	}

	@Post('/user/login')
	@Throttle({ login: { limit: 5, ttl: 60_000 } })
	@ApiOperation({ summary: 'User - Login (tenant-scoped, requires tenant_code). Rate-limited to 5 attempts per minute per IP.' })
	@ApiBody({ type: UserLoginDTO })
	async userLogin(@Res() res: Response, @Body() data: UserLoginDTO) {
		try {
			const validation = await this.authService.validateUserLogin(data.username, data.password);
			if (!validation.isAllowLogin || !validation.user) {
				return ApiResponseHelper.sendResponse(res, null, validation.message, 401);
			}

			const user = validation.user;
			const now = new Date();
			await Promise.all([
				User.query().patch({ last_logindate: now }).where({ uuid: user.uuid }),
				Tenant.query().patch({ last_active_at: now } as any).where({ uuid: user.tenant_uuid }),
			]);

			const { access_token } = this.authService.signUserToken(user);

			// Enrich with current + scheduled subscription state. The lazy hook in
			// validateUserLogin already promoted any due scheduled row, so `tenant`
			// reflects the freshest current_* fields.
			let subscription: ReturnType<typeof buildTenantSubscription> | null = null;
			if (validation.tenant) {
				const [plan, scheduled] = await Promise.all([
					validation.tenant.current_subscription_plan_uuid
						? (SubscriptionPlan.query().findOne({
								uuid: validation.tenant.current_subscription_plan_uuid,
							}) as unknown as Promise<SubscriptionPlan | undefined>)
						: Promise.resolve(undefined),
					TenantSubscriptionHistory.query()
						.findOne({ tenant_uuid: validation.tenant.uuid, status: 'scheduled' }) as unknown as Promise<TenantSubscriptionHistory | undefined>,
				]);
				subscription = buildTenantSubscription(validation.tenant, plan, scheduled);
			}

			// Merged permission matrix (all access_templates rows + user overrides).
			const access = await this.userAccessService.listForUser(user.uuid, {});

			return ApiResponseHelper.sendResponse(
				res,
				{
					access_token,
					type: 'user',
					uuid: user.uuid,
					username: user.username,
					name: user.name,
					email: user.email,
					role: user.role,
					tenant_uuid: user.tenant_uuid,
					tenant: validation.tenant
						? {
								uuid: validation.tenant.uuid,
								store_code: validation.tenant.store_code,
								display_name: validation.tenant.display_name,
								owner_name: validation.tenant.owner_name ?? null,
								currency: validation.tenant.currency,
							}
						: null,
					subscription,
					access,
					last_logindate: new Date(),
				},
				validation.message
			);
		} catch (error: any) {
			console.error(error);
			return ApiResponseHelper.sendResponse(res, null, error?.message || 'Login failed.', 500);
		}
	}
}
