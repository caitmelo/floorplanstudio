# Physical iPhone acceptance checklist

All checks are currently **NOT RUN**. Record device, iOS, Expo Go version, commit SHA, date, steps, result and screenshots for each test. Use disposable properties and photographs.

1. Fresh checkout: follow README. Sign Expo Go and the Expo CLI into the same Expo account, scan the locally generated Metro QR and confirm visible version 0.3.2; confirm no red error screen.
2. Permissions: deny camera/motion separately, retry after granting permissions, confirm understandable recovery and no crash.
3. Inspection: create a property and ingoing inspection, rename/add rooms, record each condition and notes; close/reopen and verify saved state.
4. Evidence: photograph portrait/landscape subjects; verify correct saved orientation and room association after relaunch.
5. Walkthrough: record one continuous full-level video through multiple rooms, tap Complete level & attach, reopen the inspection and verify it is retained. Interrupt a second recording and use Exit without saving; verify no partial walkthrough is attached.
6. Panorama: tap Start 360° capture without waiting for the alignment indicator, complete all 38 targets in a room with textured walls, and check ceiling, floor, corners and wraparound seam. Save/reopen and drag/zoom. Record time and heat; repeat three rooms. Do not treat a successfully saved black/gapped image as a pass.
7. Failures: interrupt a capture, background/foreground, cancel composition, rapidly tap save, and test constrained storage. Verify no skipped targets, duplicate records or inaccessible captures.
8. Outgoing: create from ingoing; confirm baseline unchanged, items reset and changed conditions match the report.
9. Signatures: check edits clear signatures; finalisation rejects incomplete items and absent inspector signature. Finalised records must remain locked.
10. Report: export a small and a large photo-heavy inspection to Files. Review every PDF page for missing pictures, clipping, signature and condition accuracy. Test punctuation and non-ASCII names.
11. Offline: after loading the app, disable network and test local evidence/report behavior; note Expo Go's development-server startup dependency separately.
12. Retention: quit/relaunch and verify photos/panoramas/notes. Full backup and restore are not implemented; do not mark them passed.
13. LiDAR: expected unavailable. A plan screen is not evidence of scanning. Native LiDAR acceptance remains a separate unfinished project.

A desktop bundle export or unit-test pass cannot replace these results.
