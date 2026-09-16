# Physical iPhone acceptance checklist — AI walkthrough draft

All checks are currently **NOT RUN**. Record device, iOS, Expo Go version, commit SHA, date, steps, result and screenshots for every test. Use disposable properties and footage only.

1. **Launch:** Sign Expo Go and the Expo CLI into the same account. Scan the current QR and verify the visible build is **0.4.0**, with no red error screen.
2. **Permissions:** Deny camera permission, retry after granting it, and confirm the recovery text is understandable. Audio must remain off for a walkthrough.
3. **Ingoing draft:** Create a property and ingoing inspection. Record one slow walkthrough through at least three identifiable spaces. Tap **Complete level & analyse** and keep the app open until a draft is returned.
4. **Draft quality:** Verify the generated room order reflects the walkthrough; every room has five categories; each AI suggestion includes a timestamp/confidence; unseen items say **Not reviewed** rather than being guessed; and coverage warnings are present when footage is incomplete.
5. **Review gate:** Attempt finalisation before editing AI suggestions—it must fail. Open every AI-suggested item, correct one result, tap **Save condition**, then confirm finalisation remains blocked until all AI suggestions are reviewed and an inspector signature is present.
6. **Outgoing comparison:** Finalise a small ingoing baseline, create an outgoing inspection, record a second walkthrough with one visible change. Confirm that the draft preserves any room not detected as **Not reviewed**, and only presents visible differences for review. It must not claim cause or liability.
7. **Upload failures:** Test unavailable network, an upload interrupted by backgrounding, a clip over the 500 MB limit, and an invalid/expired endpoint. Verify the walkthrough receives a failed status and no false draft is created.
8. **Privacy:** Confirm that the recording stays on the phone after analysis. Confirm that the temporary upload is not accessible from another device and inspect service logs/temporary storage after a test, if available.
9. **Photos:** Add a close-up photo to a suggested issue, relaunch the app and verify the room association and orientation.
10. **Report:** Export an AI-assisted draft and a finalised report. Check for the AI walkthrough provenance, timestamps, coverage warnings, review status, correct notes, condition values, photos and signatures on every PDF page.
11. **Retention:** Quit/relaunch and confirm local notes, video status, AI draft and photos remain. Backup/restore and cloud synchronization are not implemented.
12. **Scope:** Confirm no measured floor plan, 360° reconstruction, liability decision or legal tenancy conclusion is presented as the output of a walkthrough video.

A desktop bundle export, endpoint health check or unit-test pass cannot replace these device results.
