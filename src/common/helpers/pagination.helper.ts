import { QueryBuilder, Model } from 'objection';

export interface PagedResult<T> {
	results: T[];
	total: number;
	page_count: number;
	page_number: number;
	page_size: number;
}

export async function applyPagination<M extends Model>(
	query: QueryBuilder<M, M[]>,
	page_number?: number,
	page_size?: number
): Promise<PagedResult<M>> {
	const pn = Number(page_number ?? 0);
	const ps = Number(page_size ?? 0);

	if (pn > 0 && ps > 0) {
		const paged = await query.page(pn - 1, ps);
		return {
			results: paged.results as M[],
			total: paged.total,
			page_count: paged.results.length,
			page_number: pn,
			page_size: ps,
		};
	}

	const rows = (await query) as unknown as M[];
	return {
		results: rows,
		total: rows.length,
		page_count: rows.length,
		page_number: 0,
		page_size: 0,
	};
}
