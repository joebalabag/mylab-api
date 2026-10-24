import { Model } from 'objection';

/**
 * One row per public (QR-code) view of a finalized lab report. Inserted by
 * LabReportService.renderPublicHtml on every successful token resolve. See
 * migration 20261024000100_lab_report_access_logs.
 */
export class LabReportAccessLog extends Model {
	static tableName = 'lab_report_access_logs';
	static idColumn = 'uuid';

	uuid!: string;
	lab_report_uuid!: string;
	tenant_uuid!: string;
	accessed_at!: Date;
	client_ip?: string | null;
	user_agent?: string | null;
}
