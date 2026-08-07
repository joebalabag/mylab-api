import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsInt,
	IsOptional,
	Min,
	ValidateNested,
} from 'class-validator';
import { toBool } from '@/common/helpers/transform.helper';

export class UserAccessItemDTO {
	@ApiProperty({ required: true, example: 1, description: 'access_templates.navigation_id — used to snapshot catalog / main / sub / remarks.' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	navigation_id!: number;

	@ApiProperty({ required: true, type: Boolean, description: 'Whether the user should have access to this node.' })
	@Transform(toBool)
	@IsBoolean()
	has_access!: boolean;
}

export class SaveUserAccessDTO {
	@ApiProperty({
		required: true,
		type: [UserAccessItemDTO],
		description: 'Complete access matrix for the user. Existing rows are deleted and replaced with these.',
	})
	@IsArray()
	@ArrayNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => UserAccessItemDTO)
	items!: UserAccessItemDTO[];
}

export class UserAccessListQueryDTO {
	@ApiProperty({ required: false, type: Boolean, description: 'When true, only rows with has_access=true.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	only_granted?: boolean;
}
