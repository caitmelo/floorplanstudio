# RoomRecord — AI walkthrough inspection prototype

**Status: experimental. The iPhone camera and AI workflow must be physically tested before use on a live tenancy matter.**

RoomRecord turns **one continuous walkthrough video** into a **reviewable draft** for an ingoing or outgoing rental inspection. It is not a “record and automatically finalise” system. The app records the video, uploads it to a private analysis endpoint, asks an AI to identify visible spaces and condition evidence, then creates editable room and checklist suggestions with a video timestamp and confidence level.

## The intended workflow

1. Create an **ingoing** or **outgoing** inspection.
2. Select **Record & analyse walkthrough** and record one steady pass through the whole property.
3. Tap **Complete level & analyse**. The app uploads the video and waits for a draft.
4. Review the generated rooms and every condition suggestion. Open each item, correct it if needed, then tap **Save condition** to confirm it.
5. Add close-up photos for anything significant. Sign and export only after all AI suggestions have been reviewed.

For an outgoing inspection, the app provides the latest finalised ingoing record to the AI as a reference. It only proposes visible differences; it does not decide responsibility, causation, liability or legal compliance.

## What the analysis does and does not do

The analysis creates room labels, one suggestion for each condition category, notes, video timestamps, confidence levels, and coverage warnings. It uses **Not reviewed** when footage does not clearly show a category. It is intentionally conservative: a video cannot prove hidden defects, exact dimensions, a full inventory, a cause of damage, or a legal tenancy conclusion.

The recording is stored on the phone as evidence. The temporary upload used for the current analysis session is deleted by the service after it returns a draft. The report records that an AI walkthrough draft was used and lists coverage warnings. The app cannot be finalised while any AI suggestion remains unreviewed.

> This is not a prescribed tenancy form, a legal assessment, a tamper-evident signing system, or a substitute for an inspector’s review. Test with disposable data before using it operationally.

## Run the prototype

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

The analysis endpoint needs a separately configured authenticated backend and must not be treated as production-ready merely because the Expo client runs. The current test session uses a temporary, untracked endpoint configuration (`src/analysis.config.ts`) and a local `analysis-server.mjs`; neither is a durable deployment or an access-control system for multiple users.

Install an Expo Go version supporting SDK 57 on the iPhone. Expo Go and the Expo CLI must be signed into the same Expo account. The screen should show **0.4.0** beside “On this phone.”

## Scope limits

RoomRecord does **not** create a reliable floor plan from a walkthrough video. The old LiDAR and panorama prototypes remain supplemental experiments only; they are not part of the primary video-to-inspection workflow. Native RoomPlan integration, cloud backup, a multi-user server, role-based access controls, and signed iOS distribution are separate unfinished work.

`src/` contains the React Native client. `analysis-server.mjs` is a temporary private analysis service for this test session. `tests/` contains regression tests for data integrity, review gating and pose math. CI-style checks cover TypeScript, tests and iOS JavaScript bundle export; they do not prove real-device camera, upload, AI, or PDF behavior.
