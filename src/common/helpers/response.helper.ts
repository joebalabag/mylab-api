import { Response } from 'express';

export interface ApiWarning {
	/** Dotted, machine-readable identifier, e.g., "notification.skipped.no-contact-email". */
	code: string;
	/** Human-readable, safe to show in the UI. */
	text: string;
	/** Optional extra context for debugging (tenant_uuid, channel, etc.). */
	meta?: Record<string, any>;
}

export class ApiResponseHelper {
	static sendResponse<T>(
		res: Response,
		response: T,
		message = 'Request successful',
		status = 200,
		warnings?: ApiWarning[],
	) {
		if ((response === undefined || response === null) && status !== 500) {
			status = status === 200 ? 400 : status;
			message = message || 'No data found.';
		}
		response = ApiResponseHelper.convertDatesToStrings(response);
		const body: any = { response, message, status };
		if (warnings && warnings.length) body.warnings = warnings;
		return res.status(status).json(body);
	}

	static sendAlreadyExist(res: Response, message = 'Data already exists') {
		return res.status(400).json({ response: null, message, status: 400 });
	}

	static sendBadRequest(res: Response, message = 'Bad request') {
		return res.status(400).json({ response: null, message, status: 400 });
	}

	static sendUnauthorized(res: Response, message = 'Unauthorized') {
		return res.status(401).json({ response: null, message, status: 401 });
	}

	static sendNotFound(res: Response, message = 'Not found') {
		return res.status(404).json({ response: null, message, status: 404 });
	}

	private static convertDatesToStrings(data: any, seen = new WeakSet()): any {
		if (!data) return data;
		if (typeof data === 'object') {
			if (seen.has(data)) return data;
			seen.add(data);
		}
		if (data instanceof Date) return ApiResponseHelper.formatDateToManila(data);
		if (Array.isArray(data)) return data.map((i) => ApiResponseHelper.convertDatesToStrings(i, seen));
		if (typeof data === 'object') {
			const result: any = {};
			for (const key in data) {
				if (Object.prototype.hasOwnProperty.call(data, key)) {
					result[key] = ApiResponseHelper.convertDatesToStrings(data[key], seen);
				}
			}
			return result;
		}
		return data;
	}

	private static formatDateToManila(date: Date): string {
		const options: Intl.DateTimeFormatOptions = {
			timeZone: 'Asia/Manila',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		};
		const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
		const p: Record<string, string> = {};
		parts.forEach((x) => (p[x.type] = x.value));
		return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}+08:00`;
	}
}
