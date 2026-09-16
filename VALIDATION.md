# Validation record — RoomRecord 0.3.2

Performed in Linux with Node 24.19.0, 2026-09-16:

| Check | Result | Limit |
| --- | --- | --- |
| Dependency installation | PASS, 497 packages installed; lockfile generated | Initial install used --ignore-scripts |
| SDK package compatibility | Local Expo bundled-version check used after online check timed out; expo-sharing updated from 57.0.19 to ~57.0.20 | Offline check cannot verify current remote metadata |
| TypeScript `npm run typecheck` | PASS | Does not execute native features |
| `npm test` | PASS, 5 tests | Exact finalisation count; baseline isolation/comparison; whole-level walkthrough isolation; scan rejection atomicity; gyro norm/gap math only |
| `npm run export:ios` | PASS, exit 0; 786 modules, 1.9 MB Hermes bundle | JavaScript export, not Xcode build or physical-device test |
| Latest earlier Snack ZIP | Single compiled App.js matched local compiled output | Does not establish which artifact ran on the user's phone |
| iPhone launch/camera/stitch/walkthrough/PDF | NOT RUN | Hardware unavailable in this environment |
| Native LiDAR build | NOT RUN / module absent | This edition has a null native capture bridge |
| GitHub Actions | Configuration supplied | No successful hosted workflow run claimed |

Expo printed a forced-exit message after successful export. Node's test loader printed a module-format inference warning. Neither prevented these checks completing, but CI and physical-device behavior remain separate evidence to collect.

This commit is an audited source handoff, not certification that the app works in its entirety. See TEST-ON-IPHONE.md for acceptance criteria.
