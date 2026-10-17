import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export const COPYABLE_CATALOG_TABLES = [
	'doctors',
	'discounts',
	'item_groups',
	'item_categories',
	'test_items',
	'test_item_components',
	'item_packages',
	'item_package_items',
] as const;
export type CopyableCatalogTable = (typeof COPYABLE_CATALOG_TABLES)[number];

export class TenantMigrationPasswordDTO {
	@ApiProperty({ required: true, description: "Acting super-admin's password for re-verification before executing the destructive action." })
	@IsNotEmpty()
	@IsString()
	password!: string;
}

export class CopyTenantCatalogDTO {
	@ApiProperty({ required: true, description: "Acting super-admin's password for re-verification." })
	@IsNotEmpty()
	@IsString()
	password!: string;

	@ApiProperty({ required: true, description: 'Source tenant whose catalog rows will be copied.' })
	@IsUUID()
	source_tenant_uuid!: string;

	@ApiProperty({
		required: true,
		isArray: true,
		enum: COPYABLE_CATALOG_TABLES as unknown as string[],
		description: 'Catalog tables to copy. Target must have zero rows in each selected table or the request is refused with 409.',
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsIn(COPYABLE_CATALOG_TABLES as unknown as string[], { each: true })
	tables!: CopyableCatalogTable[];
}
