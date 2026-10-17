import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import config from '../knexfile';

const SRC_TENANT = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';
const TGT_TENANT = 'f1e56413-89fa-4112-aca3-6a6b9a0775f2';

const COMMIT = process.argv.includes('--commit');

// Translate a stored "/public/uploads/..." URL to an absolute filesystem path
// under this process's cwd. Returns null for empty/unsafe inputs.
function toAbs(stored: string | null | undefined): string | null {
	if (!stored) return null;
	const stripped = stored.replace(/^\/?public\//, '');
	if (!stripped || stripped.includes('..')) return null;
	return join(process.cwd(), 'public', stripped);
}

// Duplicate the physical file under a fresh UUID in the same subfolder
// (YYYY/MM layout preserved so later cleanup/backup jobs don't get confused).
// Returns the new public URL (string stored in the DB) or null if the source
// file isn't on disk here.
function duplicateFileOrNull(storedUrl: string): string | null {
	const abs = toAbs(storedUrl);
	if (!abs || !existsSync(abs)) return null;

	const ext = extname(abs);
	const newName = `${uuidv4()}${ext}`;
	const newAbs = join(dirname(abs), newName);
	mkdirSync(dirname(newAbs), { recursive: true });
	copyFileSync(abs, newAbs);

	// Rebuild the public URL from the stored URL (keep the same /public/... prefix
	// and folder, just swap the filename).
	const slash = storedUrl.lastIndexOf('/');
	return storedUrl.slice(0, slash + 1) + newName;
}

async function main() {
	const db = knex(config);
	try {
		const src = await db('tenants')
			.where({ uuid: SRC_TENANT })
			.first('company_logo', 'lab_header_mode', 'lab_header_image', 'lab_header_text');
		const tgt = await db('tenants')
			.where({ uuid: TGT_TENANT })
			.first('company_logo', 'lab_header_mode', 'lab_header_image', 'lab_header_text');

		if (!src) throw new Error(`Source tenant ${SRC_TENANT} not found`);
		if (!tgt) throw new Error(`Target tenant ${TGT_TENANT} not found`);

		console.log('Source branding:');
		console.log(`  company_logo     : ${src.company_logo ?? '(null)'}`);
		console.log(`  lab_header_mode  : ${src.lab_header_mode ?? '(null)'}`);
		console.log(`  lab_header_image : ${src.lab_header_image ?? '(null)'}`);
		console.log(`  lab_header_text  : ${src.lab_header_text ?? '(null)'}`);
		console.log();
		console.log('Target branding (BEFORE):');
		console.log(`  company_logo     : ${tgt.company_logo ?? '(null)'}`);
		console.log(`  lab_header_mode  : ${tgt.lab_header_mode ?? '(null)'}`);
		console.log(`  lab_header_image : ${tgt.lab_header_image ?? '(null)'}`);
		console.log(`  lab_header_text  : ${tgt.lab_header_text ?? '(null)'}`);
		console.log();

		const patch: Record<string, any> = {
			lab_header_mode: src.lab_header_mode,
			lab_header_text: src.lab_header_text,
			updated_at: new Date(),
		};

		// For image fields: prefer duplicating the physical file so the two
		// tenants don't share a filesystem path (removeLogoFile / removeLabHeaderFile
		// unlink on replace — one tenant editing would break the other). Fall back
		// to copying the stored URL as-is if the file isn't on this host.
		const warnings: string[] = [];

		if (src.company_logo) {
			const dup = duplicateFileOrNull(src.company_logo);
			if (dup) {
				patch.company_logo = dup;
				console.log(`company_logo       → duplicated file: ${dup}`);
			} else {
				patch.company_logo = src.company_logo;
				warnings.push(
					`company_logo file not found on this host (${src.company_logo}); storing the ` +
						'same path on both tenants. On the host that actually has the file, run ' +
						'this script again to duplicate it, OR be aware that editing one tenant\'s ' +
						'logo via the UI will delete the file the other tenant still references.',
				);
			}
		} else {
			patch.company_logo = null;
		}

		if (src.lab_header_image) {
			const dup = duplicateFileOrNull(src.lab_header_image);
			if (dup) {
				patch.lab_header_image = dup;
				console.log(`lab_header_image   → duplicated file: ${dup}`);
			} else {
				patch.lab_header_image = src.lab_header_image;
				warnings.push(
					`lab_header_image file not found on this host (${src.lab_header_image}); storing ` +
						'the same path on both tenants (same risk as company_logo).',
				);
			}
		} else {
			patch.lab_header_image = null;
		}

		console.log();
		console.log('Target branding (AFTER, planned):');
		for (const k of ['company_logo', 'lab_header_mode', 'lab_header_image', 'lab_header_text']) {
			console.log(`  ${k.padEnd(17)}: ${patch[k] ?? '(null)'}`);
		}
		console.log();

		if (warnings.length) {
			for (const w of warnings) console.warn('WARN: ' + w);
			console.log();
		}

		if (!COMMIT) {
			console.log('DRY RUN — pass --commit to apply.');
			return;
		}

		await db('tenants').where({ uuid: TGT_TENANT }).update(patch);
		console.log('COMMITTED.');

		const after = await db('tenants')
			.where({ uuid: TGT_TENANT })
			.first('company_logo', 'lab_header_mode', 'lab_header_image', 'lab_header_text');
		console.log('Target branding (AFTER, from DB):');
		console.log(`  company_logo     : ${after.company_logo ?? '(null)'}`);
		console.log(`  lab_header_mode  : ${after.lab_header_mode ?? '(null)'}`);
		console.log(`  lab_header_image : ${after.lab_header_image ?? '(null)'}`);
		console.log(`  lab_header_text  : ${after.lab_header_text ?? '(null)'}`);
	} finally {
		await db.destroy();
	}
}

main().catch((e) => {
	console.error(e.stack || e.message);
	process.exit(1);
});
