import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { LAB_REPORT_STATUSES, LabReportStatus } from '../lab-report.model';
import { RESULT_VALUE_FLAGS, ResultValueFlag } from '../lab-result-value.model';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class LabReportDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	patient_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	patient_requisition_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	item_category_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to reports whose item_category belongs to this item_group.' })
	@IsOptional()
	@IsUUID()
	item_group_uuid?: string;
}

/**
 * One node of the create-batch payload: the frontend already resolved the
 * grouping (either default from combine_printout or manual overrides) and
 * ships one group per lab_report to be created.
 */
export class LabReportCreateGroupDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Item category snapshot. NULL for single-test groups whose category disables combine_printout.',
	})
	@IsOptional()
	@IsUUID()
	item_category_uuid?: string | null;

	@ApiProperty({
		required: true,
		type: [String],
		description: 'patient_requisition_item uuids to include in this lab_report.',
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(200)
	@IsUUID('4', { each: true })
	requisition_item_uuids!: string[];

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	remarks?: string;

	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Offline sync only — when set, the created lab_report is inserted with this uuid so the client\'s Dexie cache and the server row share an identity.',
	})
	@IsOptional()
	@IsUUID()
	client_uuid?: string;
}

/**
 * Create one or more lab_reports (one per group) against a single paid
 * requisition. Server validates that every requisition_item is paid, still
 * uncovered by a live lab_report, and (for combined groups) belongs to the
 * declared item_category. Seeds lab_result_values rows for panel test_items.
 */
export class CreateLabReportBatchDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	patient_requisition_uuid!: string;

	@ApiProperty({ required: true, type: [LabReportCreateGroupDTO] })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => LabReportCreateGroupDTO)
	groups!: LabReportCreateGroupDTO[];
}

/**
 * Result-value row for a single lab_report_item. UUID present = update
 * existing row (must belong to this item); UUID absent = insert. Rows not
 * echoed back are left alone (result entry is additive per save).
 */
export class LabResultValueRowDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	uuid?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(4000)
	value_text?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	value_numeric?: number;

	@ApiProperty({ required: false, enum: RESULT_VALUE_FLAGS })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(RESULT_VALUE_FLAGS as unknown as string[])
	flag?: ResultValueFlag;
}

/** One test_item's results block: either narrative_text (narrative/culture) or a list of values (single/panel). */
export class LabReportItemResultsDTO {
	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	lab_report_item_uuid!: string;

	@ApiProperty({ required: false, description: 'narrative / culture free-text.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	narrative_text?: string;

	@ApiProperty({ required: false, type: [LabResultValueRowDTO] })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(200)
	@ValidateNested({ each: true })
	@Type(() => LabResultValueRowDTO)
	values?: LabResultValueRowDTO[];
}

/** Bulk update of every item's results on a draft lab_report. */
export class UpdateLabReportResultsDTO {
	@ApiProperty({ required: true, type: [LabReportItemResultsDTO] })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => LabReportItemResultsDTO)
	items!: LabReportItemResultsDTO[];

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	remarks?: string;

	@ApiProperty({ required: false, description: 'Manual "Time Taken" (specimen collection time).' })
	@Transform(({ value }) => (value === '' ? null : value))
	@IsOptional()
	specimen_collected_at?: string | null;
}

export class SetLabReportFinalDTO {
	@ApiProperty({
		required: false,
		description:
			'Pathologist name snapshot. Falls back to the item group\'s default signatory doctor when omitted, then to the acting user.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	pathologist_name?: string;

	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Doctor UUID to pull name / license / e-signature from. Overrides pathologist_name and skips the item-group default lookup.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	pathologist_doctor_uuid?: string;

	// ── Tester-signatory (medtech / radtech) credential ceremony ──
	// Required only when the tenant is configured for
	// tester_signatory_count = 2. The server verifies these credentials,
	// checks the resolved user is active and has lab_display_name set,
	// then stamps medtech2_* — unless the resolved user is the same as
	// slot 1 (creator), in which case medtech2_* stays null and the
	// report collapses back to a single printed signature. For count = 1
	// tenants these fields are ignored and the finalizer's session
	// identity is stamped into medtech_*.
	@ApiProperty({
		required: false,
		description:
			'Username of the second tester signatory (count=2 tenants). Required when the tenant is configured for two tester signatories.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	signatory_username?: string;

	@ApiProperty({
		required: false,
		description:
			'Password of the second tester signatory. Never persisted — used only to authenticate the sign-off.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	signatory_password?: string;
}

export class VoidLabReportDTO {
	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	@MaxLength(2000)
	reason!: string;
}

export class SetLabReportStatusDTO {
	@ApiProperty({ required: true, enum: LAB_REPORT_STATUSES })
	@IsNotEmpty()
	@IsIn(LAB_REPORT_STATUSES as unknown as string[])
	status!: LabReportStatus;
}
