import { Model } from 'objection';

/**
 * Compound-key model (tenant_uuid + group_code + year + month). Not used
 * through Objection's findById machinery — the service reads / upserts it
 * inside an advisory-lock transaction. Kept as an Objection Model only for
 * tableName consistency.
 */
export class LabNumberSequence extends Model {
	static tableName = 'lab_number_sequences';
	static idColumn = ['tenant_uuid', 'group_code', 'year', 'month'];

	tenant_uuid!: string;
	group_code!: string;
	year!: number;
	month!: number;
	next_value!: number;
	created_at?: Date;
	updated_at?: Date;
}
