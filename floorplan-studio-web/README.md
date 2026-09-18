# Floorplan Studio — current public editor

Public test: https://floorplan-studio.caitmelo.chatgpt.site/
GitHub: https://github.com/caitmelo/floorplanstudio/tree/main/floorplan-studio-web
Source revision: `5d4ad575f79ffa21e4d1219ed7e1d53134e46548` (18 September 2026).

This folder contains the browser and server code used by the public test site. The repository root contains a separate app; run this folder to test the editor shown at the public link.

## Run locally

Python 3.9 or newer; no Python packages required.

1. Copy `.env.example` to `.env.local` and enter your OpenAI API key there.
2. Run `python3 scripts/setup-vendor.py`. This verifies bundled assets in the ZIP or downloads the exact pinned assets for a GitHub checkout.
3. From this folder run `python3 -B python/server.py --env-file .env.local --port 4173`.
4. Open http://127.0.0.1:4173/.

The key is intentionally excluded from this package. The public site already has its server-side secret configured. Never put a key in browser code or GitHub.

## Included features

- OCR, recognised branding/disclaimer cleanup, dark sidebar cropping and qualifying outer-frame cleanup.
- A4 landscape/portrait; greyscale/colour. Colour adds soft fills to monochrome uploads and retains original colours on colour uploads.
- Original/edited slider, PNG export, Undo/Redo, automatic instruction clearing.
- Text renaming and bedroom numbering, selected-label mapping for combined text requests.
- AI image editing with protected text and OCR checks.
- Explicit selected-area text/icon clearing; bedroom fan removal with optional label/measurement movement.

## Runtime and deployment

`web/` is the shared browser editor. `python/` is the localhost development backend. `server/index.mjs` is the production-compatible Worker backend used by the public Site; it is current, not a deprecated implementation.

For Sites/Workers, `node scripts/build.mjs` produces `dist/server`, `dist/client`, and hosting metadata. Configure `OPENAI_API_KEY`, optionally `OPENAI_MODEL` and `OPENAI_IMAGE_MODEL`, as server-side secrets. The local Python server is not a production server. Add appropriate authentication and usage controls for your own production integration.

## Validation and limits

89 automated JavaScript tests passed on the source revision above. Live local browser tests used the supplied colour and monochrome plans to check fan removal/label movement, selected-area deletion, colourisation and revision controls. The deployed version was confirmed successful. This does not mean every possible floorplan request has been tested.

OCR and AI object locations can be wrong. Colour fills are inferred styling, not recovered original colours. Graphic edits are raster edits and require visual review. Arbitrary structural redesign and arbitrary mixed edits are not guaranteed.

To run the canvas tests, install `@napi-rs/canvas` in a separate test tools directory and set `CODEX_PRIMARY_RUNTIME_NODE_MODULES` to its `node_modules` directory, then run `node --test tests/*.test.mjs`. Python checks: `python3 -B python/test_image_edit.py`.

## Public repository assets

Property-specific sample images are excluded from the public GitHub folder; upload your own plan. The hidden legacy sample loader refers to an optional sample.png and is not needed for the upload workflow. OCR/PDF dependencies are downloaded by setup-vendor.py with SHA-256 verification. The downloadable ZIP includes those dependencies.
