# RoomRecord — inspection prototype

**Status: experimental, not verified working on an iPhone. LiDAR scanning is not implemented in this Expo Go edition.**

Recovered source for an iPhone rental inspection app. Includes ingoing/outgoing inspections, condition notes, evidence photographs, a continuous whole-level walkthrough video, guided multi-photo room panorama capture, a panorama viewer, local signatures and PDF export. These are implemented code paths, not a claim of successful device testing.

This is TypeScript/React Native with Expo SDK 57, not Python. The repository name is `floorplanstudio`; the app is RoomRecord. Version 0.3.2 adds a continuous full-level walkthrough recorder and makes the first panorama capture manually startable; it does not complete the original native LiDAR app.

## Run independently

On a computer with Node.js 24 and npm:

```sh
git clone https://github.com/caitmelo/floorplanstudio.git
cd floorplanstudio
npm ci
npm run typecheck
npm test
npm run export:ios
npm start
```

Install an Expo Go version supporting SDK 57 on the iPhone. Put the computer and phone on the same network and scan the QR produced by `npm start`. Keep Metro running. No Apple Developer login is needed for this Expo Go workflow. This repository is source code, not a hosted app or TestFlight installation. If your Expo Go version does not support SDK 57, dependency migration or a compatible client is required.

The screen should show **0.3.2** beside “On this phone.” Expo Go on iOS requires the Expo CLI and Expo Go app to be signed into the same Expo account for SDK 57 development sessions. Do not reuse an earlier anonymous QR code as verification of this commit.

## Read before evaluating

- [Audit and comparison](AUDIT.md): what exists, what is missing, known defects.
- [iPhone acceptance checklist](TEST-ON-IPHONE.md): required physical-device checks.
- [Validation record](VALIDATION.md): checks actually performed and their limits.

All inspection data and photographs are stored locally. There is no complete backup/restore or cloud sync. Use disposable test data during evaluation. Signature capture is local drawing capture; it is not a tamper-evident signing service. PDF output is not a guarantee of compliance with any tenancy form requirements.

## LiDAR and 360 scope

`src/native.ts` deliberately returns no native capture module. Plan rendering/data structures do not provide LiDAR scanning. Native RoomPlan integration and signed iOS distribution are separate unfinished work.

Panorama capture collects 38 guided photographs and projects them into a 2048×1024 equirectangular image. It relies on gyro integration and estimated lens parameters; it has no feature-based alignment, parallax correction or automatic blur rejection. It is not simultaneous 360 capture. The whole-level walkthrough is a single stabilized video attached to the inspection; it is not a 360° reconstruction or a measured floor plan. Quality, memory use and touch performance require device testing.

## Repository contents

`src/` contains the recovered implementation; `tests/` has regression checks for data integrity and pose math. The lockfile pins the dependency resolution. CI runs type checking, tests and an iOS bundle export, not native camera or LiDAR tests. No earlier native Swift/C++ implementation is included in this recovered snapshot.
