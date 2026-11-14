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
	// Phase 3 — set when a lab user reads a FINAL report from a branch
	// tenant owned by the same owner as their home tenant. Lets the audit
	// listing show "viewed by Alpha South staff while signed in to Alpha Main".
	accessed_from_tenant_uuid?: string | null;
	cross_tenant!: boolean;
}
