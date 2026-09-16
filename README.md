# RoomRecord — capture-first inspection report prototype

**Status: experimental Expo Go prototype. Use only test property footage until physical iPhone acceptance checks are complete.**

RoomRecord is deliberately built around a single workflow:

> **Start scanning → guided walkthrough → analyse → review an editable room-by-room report → share or save PDF.**

There is no property setup, room list, floor-plan process or manual 360° step before recording. A new scan immediately opens the rear camera and begins a continuous video walkthrough.

## What happens during capture

The iPhone recording view has a translucent 12-cell **capture-coverage grid** and brief, practical prompts: “Slow down”, “Move up”, “Move down”, “Keep sweeping the room”, and “Great coverage.” When Motion permission is available, cells shade green as the camera is panned and tilted through those directions. The live guide is intentionally described as **viewing coverage**.

It does **not** measure the home, reconstruct physical walls, create a spatial mesh, or claim a LiDAR scan. A real surface mesh with walls becoming green needs Apple RoomPlan/ARKit native code and cannot run in Expo Go. The current guide helps the inspector capture stronger visual evidence from a normal video without making a false spatial claim.

## What happens after recording

Tap **Complete & analyse**. The video is retained on the phone, while a temporary copy is uploaded to the configured analysis endpoint. The service asks the AI to identify visible rooms, form cautious condition suggestions and attach video timestamps. It extracts up to two compact evidence stills per room at those timestamps. The temporary uploaded video, generated still files and returned raw analysis file are deleted from the analysis service once the structured draft is returned.

The report opens as a website-like inspection record. Each room can be opened independently and shows its video stills, five condition categories, a short report note, source timestamp and confidence. Open any condition item to see the linked still and edit the condition or wording. Saving the item marks the AI suggestion as reviewed.

Property address, suburb/postcode and ingoing/outgoing type are collected after the scan through **Property details**, keeping the initial flow to one button. The report’s bottom action bar provides **Home**, **Share**, and **Save PDF**.

## Safety and scope

The AI creates a draft only. It cannot establish hidden defects, precise dimensions, tenant responsibility, cause of damage, liability, or tenancy-form compliance. It marks unseen content **Not reviewed**. Room and item suggestions should be checked against the source video before the report is used. This is not a prescribed rental form or a tamper-evident signing product.

The private test endpoint uses an untracked local configuration file for the current Expo Go session. That is appropriate only for testing a single session; it is not multi-user access control, durable hosting, backup/restore or a production privacy/security deployment.

## Test in Expo Go

The project needs Node.js 24 and an Expo Go client compatible with SDK 57:

```sh
git clone https://github.com/caitmelo/floorplanstudio.git
cd floorplanstudio
npm ci
npm run typecheck
npm test
npm run export:ios
npm start -- --tunnel
```

Expo Go and Expo CLI must be authenticated with the same Expo account for this SDK 57 session. The visible client version for this release is **0.5.0**.

## Developer components

- `src/Main.tsx` — capture-first mobile flow and editable report views.
- `src/GuidedCapture.tsx` — Expo Go camera recording, motion-based viewing-coverage grid and guide text.
- `src/walkthroughAnalysis.ts` — authenticated client upload and response validation.
- `analysis-server.mjs` — temporary local analysis service; runs `manus-analyze-video` and extracts room evidence stills with FFmpeg.
- `tests/model.test.mjs` — model integrity and AI-review gate checks.

The project’s automated checks validate the TypeScript code, model behavior and iOS JavaScript export. They do not replace physical verification of camera access, motion guidance, long video uploads, AI analysis, PDF rendering or sharing on an iPhone.
