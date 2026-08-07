import { Controller, ForbiddenException, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { ReportsQueryDTO, ReportsYearQueryDTO } from './dto/reports-query.dto';

function scope(current: any, requested?: string): string {
	if (current?.type === 'admin') {
		if (!requested) throw new ForbiddenException('tenant_uuid is required for admin token.');
		return requested;
	}
	if (current?.type === 'user' && current.tenant_uuid) return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
	constructor(private readonly service: ReportsService) {}

	@Get('/summary')
	@ApiOperation({ summary: 'Reports - Overview KPIs for the range (revenue, discounts, voids, expenses, net).' })
	async summary(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.summary(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/monthly-sales')
	@ApiOperation({ summary: 'Reports - 12-month sales breakdown for the given year.' })
	async monthlySales(@Res() res: Response, @Query() q: ReportsYearQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			const year = q.year ?? new Date().getFullYear();
			return ApiResponseHelper.sendResponse(res, await this.service.monthlySales(t, year));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/monthly-tests')
	@ApiOperation({ summary: 'Reports - 12-month test volume breakdown for the given year.' })
	async monthlyTests(@Res() res: Response, @Query() q: ReportsYearQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			const year = q.year ?? new Date().getFullYear();
			return ApiResponseHelper.sendResponse(res, await this.service.monthlyTests(t, year));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/cashier-sales')
	@ApiOperation({ summary: 'Reports - Sales grouped by cashier (created_by). Optional created_by filter.' })
	async cashierSales(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.cashierSales(t, q.date_from, q.date_to, q.created_by));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/voids')
	@ApiOperation({ summary: 'Reports - Voided payments in the range (row list + total).' })
	async voids(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.voids(t, q.date_from, q.date_to, q.created_by));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/daily-sales')
	@ApiOperation({ summary: 'Reports - Daily sales tape (revenue, cash-only subtotal, discounts, count).' })
	async dailySales(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.dailySales(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/daily-detailed-sales')
	@ApiOperation({ summary: 'Reports - Per-payment detail rows with itemized tests, grouped by day.' })
	async dailyDetailedSales(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.dailyDetailedSales(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/expenses')
	@ApiOperation({ summary: 'Reports - Expense report. Filter by date range + optional single category.' })
	async expenses(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.expenses(t, q.date_from, q.date_to, q.category));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/daily-tests')
	@ApiOperation({ summary: 'Reports - Daily test volume (qty, unique tests, orders, revenue).' })
	async dailyTests(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.dailyTests(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/discounts')
	@ApiOperation({ summary: 'Reports - Discount usage: code, count, amount given away.' })
	async discounts(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.discounts(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/payment-summary')
	@ApiOperation({ summary: 'Reports - Payment method × status breakdown.' })
	async paymentSummary(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.paymentSummary(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/test-analytics/volume')
	@ApiOperation({ summary: 'Reports - Test volume timeseries + top-20 tests by count.' })
	async testVolume(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.testVolume(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/test-analytics/categories')
	@ApiOperation({ summary: 'Reports - Test category / department mix.' })
	async testCategories(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.testCategoryMix(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}

	@Get('/test-analytics/tat')
	@ApiOperation({ summary: 'Reports - Turnaround time (requisition → finalized report) per category. Median / p95 / avg hours.' })
	async testTAT(@Res() res: Response, @Query() q: ReportsQueryDTO, @CurrentUser() current: any) {
		try {
			const t = scope(current, q.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.testTAT(t, q.date_from, q.date_to));
		} catch (e: any) { return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500); }
	}
}
