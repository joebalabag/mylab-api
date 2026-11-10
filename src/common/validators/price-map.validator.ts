import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Ensures the decorated value is a plain object mapping string keys
 * (tenant UUIDs) to finite non-negative numbers. Undefined and null pass
 * through so this composes with `@IsOptional()`. Pair with `@IsObject()`
 * when the property is required and non-null — this validator keeps its
 * focus on the map's shape, not its presence.
 *
 * Service-side code still does per-entry coercion for defence-in-depth,
 * but 400 at the HTTP boundary beats silent skips for malformed payloads.
 */
@ValidatorConstraint({ name: 'IsPriceMap', async: false })
export class IsPriceMapConstraint implements ValidatorConstraintInterface {
	validate(value: unknown): boolean {
		if (value === undefined || value === null) return true;
		if (typeof value !== 'object' || Array.isArray(value)) return false;
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (typeof k !== 'string' || !k) return false;
			const num = typeof v === 'number' ? v : Number(v);
			if (!Number.isFinite(num) || num < 0) return false;
		}
		return true;
	}

	defaultMessage(args: ValidationArguments): string {
		return `${args.property} must be an object mapping tenant_uuid → non-negative finite price.`;
	}
}

export function IsPriceMap(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			target: object.constructor,
			propertyName,
			options: validationOptions,
			constraints: [],
			validator: IsPriceMapConstraint,
		});
	};
}
