/**
 * Shared class-transformer helpers.
 *
 * Both read the RAW value from `obj[key]` instead of trusting the `value`
 * argument. Rationale: the app-wide ValidationPipe runs with
 * `enableImplicitConversion: true`, which for `boolean`-typed fields
 * eagerly coerces strings via `Boolean(value)` BEFORE @Transform callbacks
 * run. Since `Boolean('0') === true` (any non-empty string is truthy),
 * multipart form-data endpoints receiving `is_vat_registered=0` would end
 * up saving `true`. Grabbing the untouched value off `obj` sidesteps that.
 */

type TransformArgs = { value: any; key: string; obj: any };

export const emptyToUndef = ({ value, key, obj }: TransformArgs) => {
	const raw = obj && key in obj ? obj[key] : value;
	return raw === '' ? undefined : raw;
};

export const toBool = ({ value, key, obj }: TransformArgs) => {
	const raw = obj && key in obj ? obj[key] : value;
	if (raw === true || raw === false) return raw;
	if (raw === undefined || raw === null || raw === '') return undefined;
	const v = String(raw).toLowerCase().trim();
	if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
	if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
	return raw;
};
