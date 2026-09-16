# RoomRecord v0.5.0 — physical iPhone acceptance checklist

All checks are currently **NOT RUN**. Record the iPhone model, iOS version, Expo Go version, commit SHA, date, result and screenshots. Use disposable test footage and properties.

1. **One-button entry:** Launch the app, ensure the landing page contains only the primary **Start scanning** action, tap it, grant Camera permission and confirm the rear camera begins recording without property setup.
2. **Exit control:** Tap the top-right X during recording. Choose **Keep recording**, then repeat and choose **Discard recording**. Confirm the recording is neither analysed nor retained, and no empty “New inspection” record remains.
3. **Coverage guidance:** Grant Motion permission. Slowly pan and tilt through a room. Confirm cells turn green only as camera direction changes, live prompts are readable, and “Slow down”, “Move up” and “Move down” appear when appropriate. Confirm copy says viewing coverage, not a measured or spatial scan.
4. **Motion fallback:** Deny Motion permission and confirm recording remains available, with the honest “Keep a steady sweep” instruction explaining that motion access enables live shading. No fabricated coverage percentage may be presented as real coverage.
5. **Video capture:** Record a three-room walkthrough at chest height, including walls, ceiling line, floor, doors and windows. Tap **Complete & analyse**. Ensure recording stops cleanly and the progress screen remains responsive.
6. **Analysis:** Verify upload progress, analysis-stage labels and the “Your recording has been analysed” confirmation. Confirm the report includes all recognisable rooms, one evidence still for each room where available, timestamps and confidence, plus coverage warnings for unseen areas.
7. **Editing:** Open a room, then an AI-suggested condition. Confirm its linked video still and timestamp match the note. Change its condition and text, save it, and confirm the card changes to **Reviewed by inspector**.
8. **Property details:** Add address, suburb/postcode and select ingoing/outgoing after the scan. Confirm these values appear in both the app report and the exported PDF.
9. **Report actions:** Use **Home**, **Share** and **Save PDF**. Check the native share sheet, Files destination, PDF room sections, video-evidence stills, report notes and AI-draft disclosure.
10. **Failure recovery:** Test airplane mode before upload, an interrupted upload, an over-500 MB recording, backgrounding during recording and backgrounding during analysis. Confirm the app provides an understandable error and lets the user retry without inventing a report.
11. **Privacy retention:** Confirm the original recording stays on the iPhone after analysis. Inspect the temporary test service workspace/logs after a run to confirm uploaded video and generated temporary artifacts are removed.
12. **Scope:** Verify that no screen calls camera coverage a LiDAR scan, 3D spatial mesh, floor plan, real-wall measurement, legal condition determination or liability conclusion.

Passing TypeScript, unit tests and an iOS JavaScript export does not replace any of these device checks.
