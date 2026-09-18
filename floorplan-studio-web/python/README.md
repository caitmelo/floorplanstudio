# Python backend

Python 3.9+, no third-party dependencies. From the project root:

```sh
python3 -B python/server.py --env-file .env.local --port 4174
```

Open http://127.0.0.1:4174/. Environment file accepts OPENAI_API_KEY and OPENAI_MODEL. Keep it private. The backend serves only web/ and implements the same /api/status and /api/plan routes as the earlier JavaScript backend. AI responses are validated before reaching the browser. The browser remains JavaScript for canvas editing and OCR.

This is a localhost development server, not a production deployment. Existing raster editing limitations remain; see the developer handoff README. API credentials are not included.

## AI image-editing prototype

The checked AI image editing control uses `/api/image-edit` and `OPENAI_IMAGE_MODEL` (default `gpt-image-2.5-sunburst`). The browser can locate a named area through `/api/plan` with `imageEdit: true`, or use a drawn selection. Fixture insertion still uses AI placement plus standard symbols; explicit text edits remain editable text.

For graphic edits, the browser sends a contextual crop, composites only the requested rectangle, restores original recognised text fields with a protective margin, then reruns full-page OCR. The current browser workflow does not send a provider mask. A tested provider-mask attempt yielded a visually invalid black fill; app-side pixel boundaries remain mandatory. The backend accepts optional valid PNG masks for integrations, with dimensions checked before sending.

OCR field detection excludes isolated drawing strokes while retaining room-name lines and measurement fields. It cannot guarantee recognition of every glyph. A dark-fill guard rejects large newly black regions during removal; OCR rejects unexpected text in altered pixels. These checks are not full geometric or semantic verification. Review outputs before use.

Run backend mask tests with `python3 -B python/test_image_edit.py`. Browser evidence and the broader incomplete checklist are in the task outputs folder; no claim of exhaustive support is made.
