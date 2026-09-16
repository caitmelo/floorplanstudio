# RoomRecord audit — 2026-09-16

## Verdict

The delivered experience failed to launch on the user's phone. This is an incomplete prototype, not a verified inspection product. Earlier successful publishing and parsing checks were insufficient evidence of a usable app. The current snapshot compiles, but physical camera capture, stitching, persistence and PDF sharing still need an end-to-end iPhone test.

## Evidence and delivery failures

1. First screenshot: `Unable to fetch module expo-camera@57.0.5 for ios`. Earlier Snack dependency metadata lacked versioned handles. Handle changes were based on Expo Snack source, but prebuilt dependency bundle availability could not be verified from this environment.
2. Next screenshots: `/src/model.ts: Unexpected token (105:34)` at `version: 1`. This is valid TypeScript and passes the normal project's TypeScript compiler. The error therefore requires investigation of the Snack transform/packaging path, not changing a valid type merely to hide it.
3. The later anonymous Snack `11zeFLBg3VzRRVOZeooOZ` was downloaded and inspected. Its application entry is a single compiled `App.js`, byte-identical to the previously generated local JavaScript file; it does not contain the separate `src/model.ts` file named in the screenshot. This establishes an artifact mismatch, but does not prove whether the cause is old QR selection, cached delivery or another runtime issue.
4. No successful physical-device launch has been observed. Multiple anonymous projects and no displayed build identifier made troubleshooting unnecessarily ambiguous. This source revision displays version 0.3.1 and provides one reproducible checkout.

## Comparison with PropertyMe Manager

Comparison is based on the vendor's documented capabilities, not a hands-on benchmark. Sources: [Inspections](https://www.propertyme.com.au/features/inspections) and [Paperless inspections](https://www.propertyme.com.au/features/paperless-inspections).

| Capability | PropertyMe documented behavior | RoomRecord recovered source |
| --- | --- | --- |
| Inspection workflow | Entry, exit and routine inspections | Ingoing/outgoing only; no routine workflow |
| Room condition evidence | Customisable areas, photos and comments | Rooms, five default condition items, notes and photos; limited template control |
| 360 evidence | 360 images supported in inspection reports | Experimental guided 38-frame stitching and viewer; device quality unverified |
| Reports and access | Reports available through app/client access | Local PDF export; no hosted interactive report or client portal |
| Tenant participation | Digital entry-report comments, photos and signatures | Local signature pad only; no remote tenant completion |
| Storage | Mobile/cloud sync | AsyncStorage plus local image files; no full backup/restore |
| Follow-up | Follow-up actions and inspection administration | No task assignment, reminders or tenant notification workflow |

Roomio's [features page](https://roomio.io/features/) additionally documents floor-plan editing, room labels, branded templates, team access and API/webhooks. RoomRecord has plan rendering structures but no functioning scan acquisition in this edition, no comparable editing service and no team/API system. These pages do not establish independent accuracy measurements for either product.

## Architecture and source review

Reviewed model, storage, inspection UI, report generation, signature handling, plan geometry/rendering, native bridge stub, panorama capture, pose math and embedded compositor/viewer paths.

### Blocking gaps

- **LiDAR absent:** `src/native.ts` has a null capture module. Plan data types and screens cannot scan a room. Earlier native work is not part of this recovered repository and has not been compiled here.
- **Capture unverified:** no completed iPhone capture-to-report session. Gyro-only orientation accumulates drift; camera/gyro timing and coordinate conventions need real-device verification.
- **Stitch quality:** no image-feature matching, bundle adjustment, lens distortion correction, translation/parallax correction, exposure matching or blur rejection. Fixed/estimated focal calibration can produce seams and misalignment.
- **Packaging reliability:** compile/export now passes, but that does not verify the published Snack runtime or Expo Go dependency loading on the user's device.

### Important reliability gaps

- Compositor allocates roughly 56 MiB for seven Float32 values per 2048×1024 output pixel before image/canvas buffers and bridge overhead. Approximately 80 million frame/pixel checks are possible for 38 images. Actual CPU time, heat, memory and background behavior are unmeasured.
- Frame files and capture manifest are not a single transaction. The capture code pushes a frame before manifest persistence; failure can leave inconsistent session state or orphan files. Disk-full recovery and safe retries need work.
- Interrupted capture requires restarting; no resumable capture or robust individual-frame retake workflow.
- No minimum coverage/quality acceptance gate. Coverage is a pixel proportion, not a complete visual quality measure. Export does not add GPano XMP metadata for standard external panorama recognition.
- Database validation is shallow: malformed evidence/signature records can pass initial validation. There is no migration framework beyond version rejection, full backup/restore or multi-device sync.
- PDF construction embeds original image data, creating memory risk for large inspections. Pagination, image orientation, special-character escaping and iOS print/share need device acceptance checks.
- Condition comparisons do not constitute image change detection; removed items/rooms are not fully reconciled. No immutable audit history or tamper-evident signatures.
- Local storage isolation between Expo experiences may complicate moving prior test data. No migration between earlier anonymous Snacks has been demonstrated.

### Findings addressed in this revision

- Finalisation previously compared rounded percentage to 100; 249/250 reviewed items could appear complete. It now compares exact completed/total counts, with a regression test.
- Updated expo-sharing to the range required by the installed Expo SDK after the local compatibility check identified a mismatch.
- Added lockfile, explicit Node version, runnable checks, CI configuration and honest scope/testing documentation.
- Replaced anonymous Snack app identity with RoomRecord 0.3.1; configured iPhone-only platform intent and camera/motion permission plugin text for future builds.
- Added visible version text for delivery diagnosis. No new QR is represented as a verified fix.

## Required work to call this usable

1. Verify the exact checkout launches on the target iPhone, then pass TEST-ON-IPHONE.md with recorded results.
2. Fix session transaction/recovery and implement backup/restore before trusting irreplaceable inspection records.
3. Measure and improve real panorama quality using repeatable room tests; add retakes, quality rejection and standard metadata.
4. Validate reports and entry/exit workflows with realistic large inspections.
5. Implement and test native RoomPlan scanning separately, including multi-room alignment, dimensions, 2D export and cancellation recovery. Expo Go alone does not supply this application's custom native module.
6. Add the selected production workflows from the comparison; remote tenant completion, cloud access and reminders require substantial additional implementation.

None of those unfinished features should be described as delivered solely because a button or type exists in the source.
