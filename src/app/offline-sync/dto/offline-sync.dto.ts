import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsIn,
	IsISO8601,
	IsNotEmpty,
	IsObject,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';

export const OFFLINE_ENTITY_TYPES = ['patient', 'patient_case', 'payment', 'lab_report_results'] as const;
export type OfflineEntityType = (typeof OFFLINE_ENTITY_TYPES)[number];

export class EnableDeviceDTO {
	@ApiProperty({ description: 'Client-generated UUID stored in IndexedDB.' })
	@IsString() @IsNotEmpty() @MaxLength(64)
	device_id!: string;

	@ApiProperty({ required: false })
	@IsOptional() @IsString() @MaxLength(255)
	device_label?: string;

	@ApiProperty({ required: false })
	@IsOptional() @IsString() @MaxLength(500)
	user_agent?: string;
}

export class RefreshDeviceDTO {
	@ApiProperty()
	@IsString() @IsNotEmpty() @MaxLength(64)
	device_id!: string;

	@ApiProperty({ description: "Device wall-clock (ISO) — used for clock-skew detection." })
	@IsISO8601()
	device_clock!: string;
}

export class BootstrapQueryDTO {
	// Bootstrap always uses the tenant on the JWT; no explicit tenant_uuid query
	// param. Kept as a class so Swagger can document the endpoint.
}

export class PullQueryDTO {
	@ApiProperty({ description: 'ISO timestamp — return records with updated_at > since.' })
	@IsISO8601()
	since!: string;
}

export class SyncEntryDTO {
	@ApiProperty({ enum: OFFLINE_ENTITY_TYPES })
	@IsIn(OFFLINE_ENTITY_TYPES as unknown as string[])
	entity_type!: OfflineEntityType;

	@ApiProperty({ description: 'Client-generated UUID identifying the record. For updates (lab_report_results), this is the target lab_report_uuid.' })
	@IsString() @IsNotEmpty() @MaxLength(64)
	client_uuid!: string;

	@ApiProperty({ description: 'Per-entry idempotency key. Retries must reuse it.' })
	@IsString() @IsNotEmpty() @MaxLength(128)
	idempotency_key!: string;

	@ApiProperty({ description: 'Device wall-clock when the entry was captured (ISO).' })
	@IsISO8601()
	created_offline_at!: string;

	@ApiProperty({ description: 'Entity-specific payload. Shape mirrors the online create/update DTO.' })
	@IsObject()
	payload!: Record<string, any>;
}

export class SyncBatchDTO {
	@ApiProperty()
	@IsString() @IsNotEmpty() @MaxLength(64)
	device_id!: string;

	@ApiProperty({ type: [SyncEntryDTO] })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(200)
	@ValidateNested({ each: true })
	@Type(() => SyncEntryDTO)
	entries!: SyncEntryDTO[];
}

export interface SyncEntryResult {
	entity_type: OfflineEntityType;
	client_uuid: string;
	idempotency_key: string;
	status: 'ok' | 'conflict' | 'error' | 'duplicate';
	server_uuid?: string;
	server_row?: unknown;
	error?: string;
}
