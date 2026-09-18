# Floorplan revision API

Built-in processing handles recognised label renames, selected-area edits and deterministic BBQ, car, toilet, sink, bath and shower symbols. Multiple instructions form one undoable transaction. Failed transactions restore the initial drawing.

GET /api/status returns aiReady and imageRegeneration:false.
POST /api/plan accepts instruction, full-size width/height, optional selection, OCR labels with stable IDs, and a resized PNG/JPEG data URL. It returns validated ordered rename/remove/fixture operations. The server calls the Responses API only when OPENAI_API_KEY is configured. The key never goes to the browser. Unsupported or ambiguous requests return a question without edits.

AI produces edit instructions, never a regenerated image. Graphic edits preserve recognised text regions, including detected dimensions. Unrecognised text inside a removal region is not guaranteed protected. The standard disclaimer is rendered separately at a fixed A4 position and size. Recognition-based branding removal is not universal logo removal.

Without an AI connection, unsupported requests fail clearly and leave the drawing unchanged. The interpreter endpoint has been tested with local request tests, not a live paid AI call. Browser preview infrastructure was unavailable for this release; selection/submit/undo were tested through the real handlers in a DOM test harness.
