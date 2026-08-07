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

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class CreateItemPackageDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, example: 'ECHK-01' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'Executive Check-up' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	name!: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;
}

export class UpdateItemPackageDTO {
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

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;
}

export class SetItemPackageStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class ItemPackageDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;
}

/** Single line item inside a SyncItemPackageItemsDTO payload. */
export class ItemPackageItemRowDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Existing line uuid; omit to insert a new row.',
	})
	@IsOptional()
	@IsUUID()
	uuid?: string;

	@ApiProperty({ required: true, format: 'uuid', description: 'Underlying test_item to bundle.' })
	@IsNotEmpty()
	@IsUUID()
	test_item_uuid!: string;

	@ApiProperty({
		required: false,
		example: 250,
		description:
			'Snapshot of test_items.price at the time of adding. Server auto-fills from test_items.price when omitted.',
	})
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	current_price?: number;

	@ApiProperty({ required: true, example: 200, description: 'Discounted price within this package.' })
	@IsNotEmpty()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	new_price!: number;

	@ApiProperty({ required: false, description: 'Report row order. Defaults to array position.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(0)
	display_order?: number;
}

/**
 * Whole-list sync of a package's items. Same semantics as
 * test-item components: uuid → PATCH, no uuid → INSERT, missing uuid → DELETE.
 * After sync, parent.package_price is recomputed = SUM(new_price).
 */
export class SyncItemPackageItemsDTO {
	@ApiProperty({ required: true, type: [ItemPackageItemRowDTO] })
	@IsArray()
	@ArrayMaxSize(200)
	@ValidateNested({ each: true })
	@Type(() => ItemPackageItemRowDTO)
	items!: ItemPackageItemRowDTO[];
}
