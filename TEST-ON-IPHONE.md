# Physical iPhone acceptance checklist

All checks are currently **NOT RUN**. Record device, iOS, Expo Go version, commit SHA, date, steps, result and screenshots for each test. Use disposable properties and photographs.

1. Fresh checkout: follow README. Scan the locally generated Metro QR and confirm visible version 0.3.1; confirm no red error screen.
2. Permissions: deny camera/motion separately, retry after granting permissions, confirm understandable recovery and no crash.
3. Inspection: create a property and ingoing inspection, rename/add rooms, record each condition and notes; close/reopen and verify saved state.
4. Evidence: photograph portrait/landscape subjects; verify correct saved orientation and room association after relaunch.
5. Panorama: complete all 38 targets in a room with textured walls. Check ceiling, floor, corners and wraparound seam. Save/reopen and drag/zoom. Record time and heat; repeat three rooms. Do not treat a successfully saved black/gapped image as a pass.
6. Failures: interrupt a capture, background/foreground, cancel composition, rapidly tap save, and test constrained storage. Verify no skipped targets, duplicate records or inaccessible captures.
7. Outgoing: create from ingoing; confirm baseline unchanged, items reset and changed conditions match the report.
8. Signatures: check edits clear signatures; finalisation rejects incomplete items and absent inspector signature. Finalised records must remain locked.
9. Report: export a small and a large photo-heavy inspection to Files. Review every PDF page for missing pictures, clipping, signature and condition accuracy. Test punctuation and non-ASCII names.
10. Offline: after loading the app, disable network and test local evidence/report behavior; note Expo Go's development-server startup dependency separately.
11. Retention: quit/relaunch and verify photos/panoramas/notes. Full backup and restore are not implemented; do not mark them passed.
12. LiDAR: expected unavailable. A plan screen is not evidence of scanning. Native LiDAR acceptance remains a separate unfinished project.

A desktop bundle export or unit-test pass cannot replace these results.
