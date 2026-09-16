# Validation record — RoomRecord 0.5.0

Performed in Linux with Node 24.19.0, 2026-09-16:

| Check | Result | Limit |
| --- | --- | --- |
| TypeScript `npm run typecheck` | PASS | Does not execute native features |
| `npm test` | PASS, 6 tests | Includes AI walkthrough draft review gate and walkthrough-still evidence linkage |
| `npm run export:ios` | PASS, exit 0; 773 modules, 1.9 MB Hermes bundle | JavaScript export, not Xcode build or physical-device test |
| Private analysis service health and authorization | PASS | Test endpoint returns health; rejects invalid token |
| End-to-end video upload, AI draft and room stills | PASS, through the HTTPS phone endpoint | Supplied static office recording correctly produced a low-confidence draft, Not reviewed unseen categories and a compact timestamped evidence still; does not substitute for an actual property walkthrough |
| iPhone launch/camera/upload/AI/PDF | NOT RUN | Hardware unavailable in this environment |
| Native LiDAR build | NOT RUN / module absent | This edition has a null native capture bridge |
| GitHub Actions | Configuration supplied | No successful hosted workflow run claimed |

Expo printed a forced-exit message after successful export. Node's test loader printed a module-format inference warning. Neither prevented these checks completing, but CI and physical-device behavior remain separate evidence to collect.

This release is an experimental source handoff, not certification that the app works in its entirety. AI suggestions must be manually reviewed before finalisation. See TEST-ON-IPHONE.md for acceptance criteria.
