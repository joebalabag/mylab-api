# /public/downloads

Static assets served by the API at `/public/downloads/*`.

## Current state

MyLab does not ship any first-party downloads today. Lab reports and
receipts are printed directly from the browser (jsPDF + browser print
dialog), so there is no companion desktop / print-helper installer to
distribute.

Any files present in this directory are leftovers from earlier product
iterations and are safe to remove. If nothing in your frontend references
them, delete them — the folder can stay empty (Nest's static-assets
serving handles missing files with a plain 404).

## Adding a new download

If you ever need to publish a downloadable asset (installer, template
XLSX, brochure, etc.):

1. Drop the file into this folder on the server (or commit it into the
   repo under `laboratory-api/public/downloads/` and let the next deploy
   push it).
2. Reference it from the frontend using the same origin as the API:
   `{VITE_API_BASE without /api}/public/downloads/<file>`.
3. Add a link or button in the relevant view (e.g. Tenant Settings).

Files here are served with the default caching behavior configured for
`/public/*` in `src/main.ts` — no auth required.
