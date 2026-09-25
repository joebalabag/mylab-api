import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsInt,
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
import { RESULT_TYPES, ResultType } from '../test-item.model';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class CreateTestItemDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Tenant UUID. Required with admin token. Ignored/overridden with a user token.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid', description: 'Parent item category UUID (must belong to same tenant).' })
	@IsNotEmpty()
	@IsUUID()
	item_category_uuid!: string;

	@ApiProperty({ required: true, example: 'FBS', description: 'Short code, unique per tenant' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'Fasting Blood Sugar' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	name!: string;

	@ApiProperty({
		required: true,
		enum: RESULT_TYPES,
		description:
			'How results print. single = one value; panel = fixed sub-results (CBC, Urinalysis); narrative = free-text report (Histopath, Imaging); culture = organism + sensitivity matrix.',
	})
	@IsNotEmpty()
	@IsIn(RESULT_TYPES as unknown as string[])
	result_type!: ResultType;

	@ApiProperty({ required: false, description: 'Specimen or body part / modality. "Serum", "Chest PA", "12-lead", etc.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	specimen?: string;

	@ApiProperty({ required: false, description: 'Unit of measure for single-value tests. Ignored for panel/narrative/culture.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	unit_of_measure?: string;

	@ApiProperty({ required: false, description: 'Reference range text (e.g., "70-110 mg/dL").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	reference_range?: string;

	@ApiProperty({ required: false, description: 'Analytical method printed under the test name (e.g., "Qualitative Immunochromatographic Assay").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	method?: string;

	@ApiProperty({
		required: false,
		description:
			'Comma-separated allowed result values (e.g., "Positive,Negative,Indeterminate"). When set, the result editor renders a dropdown; when blank, a free-text input.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	lookup_values?: string;

	@ApiProperty({
		required: false,
		description:
			'JSON matrix config for result_type=matrix. Shape { rows: string[], cols: string[] }. Renders as a grid; one lab_result_value seeded per (row, col) cell.',
	})
	@IsOptional()
	matrix_config?: { rows: string[]; cols: string[] } | null;

	@ApiProperty({
		required: false,
		example: 0.0555,
		description:
			'SI conversion multiplier for chemistry singles. si_value = raw × factor. Prints alongside conventional value.',
	})
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	si_conversion_factor?: number;

	@ApiProperty({ required: false, example: 'mmol/L', description: 'SI unit label printed next to the SI value.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	si_unit_of_measure?: string;

	@ApiProperty({ required: false, example: '3.9-6.1', description: 'SI reference range text printed under the SI column.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	si_reference_range?: string;

	@ApiProperty({ required: false, example: 250, description: 'Item price. Defaults to 0.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	price?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;
}

export class UpdateTestItemDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	item_category_uuid?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	code?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	name?: string;

	@ApiProperty({ required: false, enum: RESULT_TYPES })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(RESULT_TYPES as unknown as string[])
	result_type?: ResultType;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	specimen?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	unit_of_measure?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	reference_range?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	method?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	lookup_values?: string;

	@ApiProperty({ required: false, description: 'JSON { rows, cols } for matrix result_type.' })
	@IsOptional()
	matrix_config?: { rows: string[]; cols: string[] } | null;

	@ApiProperty({ required: false, description: 'SI conversion multiplier for chemistry singles.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	si_conversion_factor?: number | null;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	si_unit_of_measure?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	si_reference_range?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	price?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;
}

export class SetTestItemStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

/** Single component row inside a SyncTestItemComponentsDTO payload. */
export class TestItemComponentRowDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Existing component uuid; omit to insert a new row.',
	})
	@IsOptional()
	@IsUUID()
	uuid?: string;

	@ApiProperty({ required: true, example: 'WBC' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'White Blood Cell Count' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	name!: string;

	@ApiProperty({ required: false, example: 'x10^9/L' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	unit_of_measure?: string;

	@ApiProperty({ required: false, example: '4.5-11.0' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	reference_range?: string;

	@ApiProperty({
		required: false,
		example: 'Positive,Negative',
		description:
			'Comma-separated allowed result values for this component. Non-empty = dropdown in the result editor.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	lookup_values?: string;

	@ApiProperty({
		required: false,
		example: 'PHYSICAL PROPERTIES',
		description:
			'Optional sub-section heading label. Components sharing the same section are grouped together under a bolded sub-heading on the print/report.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	section?: string;

	@ApiProperty({ required: false, example: 0.0555, description: 'SI conversion multiplier for chemistry panels.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	si_conversion_factor?: number;

	@ApiProperty({ required: false, example: 'mmol/L' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	si_unit_of_measure?: string;

	@ApiProperty({ required: false, example: '3.9-6.1' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	si_reference_range?: string;

	@ApiProperty({ required: false, example: 0, description: 'Row order on printed reports. Defaults to array position when omitted.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(0)
	display_order?: number;
}

/**
 * Whole-list sync payload for a test item's components. Semantics:
 *   - Rows with a `uuid` are updated in place.
 *   - Rows without a `uuid` are inserted (server assigns uuid).
 *   - Existing components not present in the array are DELETED.
 * If `display_order` is omitted on any row, the array index is used.
 */
export class SyncTestItemComponentsDTO {
	@ApiProperty({ required: true, type: [TestItemComponentRowDTO] })
	@IsArray()
	@ArrayMaxSize(200)
	@ValidateNested({ each: true })
	@Type(() => TestItemComponentRowDTO)
	components!: TestItemComponentRowDTO[];
}

export class TestItemDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a specific item category.' })
	@IsOptional()
	@IsUUID()
	item_category_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to all categories under this item group.' })
	@IsOptional()
	@IsUUID()
	item_group_uuid?: string;

	@ApiProperty({ required: false, enum: RESULT_TYPES })
	@IsOptional()
	@IsIn(RESULT_TYPES as unknown as string[])
	result_type?: ResultType;
}
