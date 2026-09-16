import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { compare, CONDITION_LABEL, Inspection, Property, uid } from "./model";
import { escapeHTML as e, planSVG } from "./geometry";
import { imageData } from "./storage";

export async function reportHTML(property: Property, inspection: Inspection) {
  const baseline = property.inspections.find(
    (i) => i.id === inspection.baselineId,
  );
  const changes = compare(inspection, baseline).filter((c) => c.changed);
  const rooms = [];
  for (const room of inspection.rooms) {
    const photos = [];
    for (const photo of room.evidence) {
      const data = await imageData(photo.path);
      photos.push(
        `<figure><img src="${data}"/><figcaption>${e(photo.source === "walkthrough" ? `Walkthrough evidence${photo.timestamp ? ` · ${photo.timestamp}` : ""}` : photo.kind === "panorama" ? "Panorama · flattened view" : "Photo")} · ${e(new Date(photo.capturedAt).toLocaleString())}<br/>${e(photo.caption)}${photo.coverage !== undefined ? `<br/>Image coverage: ${(photo.coverage * 100).toFixed(1)}%. Black regions are uncaptured.` : ""}</figcaption></figure>`,
      );
    }
    rooms.push(
      `<section><h2>${e(room.name)}</h2><table><thead><tr><th>Item</th><th>Condition</th><th>Notes</th></tr></thead><tbody>${room.items.map((i) => `<tr><td>${e(i.name)}</td><td>${e(CONDITION_LABEL[i.condition])}</td><td>${e(i.note)}</td></tr>`).join("")}</tbody></table>${
        room.plan
          ? `<h3>LiDAR room plan</h3>${planSVG(room.plan, room.name)}<p class="muted">Scan-derived dimensions; verify critical measurements. Whole-property alignment requires the continuous multi-room scan.</p><p>${room.plan.surfaces
              .filter((s) => s.kind === "wall")
              .map((s, idx) => `Wall ${idx + 1}: ${s.length.toFixed(2)} m`)
              .join(" · ")}</p>`
          : ""
      }<div class="photos">${photos.join("")}</div></section>`,
    );
  }
  const aiProvenance = inspection.analysis
    ? `<section><h2>AI walkthrough draft — review record</h2><p class="status">A walkthrough video was analysed on ${e(new Date(inspection.analysis.analyzedAt).toLocaleString())}. This assistance creates suggestions only; each condition must be reviewed by the inspector before finalisation.<br/>Confidence: ${e(inspection.analysis.confidence)}</p><p>${e(inspection.analysis.summary)}</p><ul>${inspection.analysis.coverageWarnings.map((warning) => `<li>${e(warning)}</li>`).join("")}</ul></section>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font:12px -apple-system,Arial,sans-serif;color:#203b34;line-height:1.5}h1{font-size:30px;line-height:1.1}h2{font-size:21px;border-bottom:2px solid #1c5c46;padding-bottom:10px}h3{font-size:15px}.brand{letter-spacing:3px;color:#267657;font-weight:bold}.muted,figcaption{color:#62736b;font-size:10px}.status{background:#eaf1e9;padding:12px;border-radius:8px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{text-align:left;padding:9px;border-bottom:1px solid #dce4dd;vertical-align:top;white-space:pre-wrap}th{background:#f0f4ef}section{break-before:page}tr,figure,.signature{break-inside:avoid}figure{margin:14px 0}img{max-width:100%;max-height:280px;object-fit:contain}svg{max-width:100%}.signature{display:inline-block;width:45%;margin:10px 3% 10px 0}.signature svg{border-bottom:1px solid #ccc}footer{margin-top:32px;font-size:10px;color:#62736b}</style></head><body><p class="brand">ROOMRECORD / INSPECTIONS</p><h1>${e(property.address)}</h1><p>${e(property.suburb)}</p><h2>${inspection.kind === "ingoing" ? "Ingoing" : "Outgoing"} condition report</h2><p class="status">${inspection.finalizedAt ? `Finalized ${e(new Date(inspection.finalizedAt).toLocaleString())}` : "DRAFT · Not finalized"}<br/>Inspection ID: ${e(inspection.id)}<br/>Created: ${e(new Date(inspection.createdAt).toLocaleString())}</p>${aiProvenance}${baseline ? `<h3>Changes from ingoing inspection</h3><p>Baseline: ${e(baseline.id)}</p><table><tr><th>Room / item</th><th>Ingoing</th><th>Outgoing</th></tr>${changes.map((c) => `<tr><td>${e(c.room)} / ${e(c.item)}</td><td>${e(CONDITION_LABEL[c.before!.condition])}</td><td>${e(CONDITION_LABEL[c.after.condition])}</td></tr>`).join("")}</table><p>Only reviewed condition differences are listed. Differences require human assessment; they do not establish responsibility.</p>` : ""}${inspection.propertyPlan ? `<section><h2>Property floor plan</h2>${planSVG({ ...inspection.propertyPlan, labels: inspection.propertyPlan.labels?.map((label) => ({ ...label, name: inspection.rooms.find((r) => r.id === label.roomId)?.name ?? label.name })) }, property.address)}<p>Continuous LiDAR scan · ${inspection.propertyPlan.roomCount} rooms. Verify critical measurements.</p></section>` : ""}${rooms.join("")}<section><h2>Signatures</h2>${inspection.signatures.length ? inspection.signatures.map((s) => `<div class="signature"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 130" width="260" height="113">${s.paths.map((p) => `<path d="${e(p)}" fill="none" stroke="#153b32" stroke-width="2" stroke-linecap="round"/>`).join("")}</svg><strong>${e(s.name)}</strong><br/>${e(s.role)} · ${e(new Date(s.signedAt).toLocaleString())}</div>`).join("") : "<p>No signatures recorded.</p>"}<footer>Recorded observations and device timestamps. AI suggestions require inspector review and are not determinations of liability, cause, or legal responsibility. This report is not a prescribed jurisdiction-specific tenancy form.</footer></section></body></html>`;
}

export async function exportReport(
  p: Property,
  i: Inspection,
  dialogTitle = "Export inspection report",
) {
  const html = await reportHTML(p, i);
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const result = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(result.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle,
  });
}

export async function exportFloorPlan(svg: string) {
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = "room-plan.svg";
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const f = new File(Paths.cache, `room-plan-${uid()}.svg`);
  f.write(svg);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is not available.");
  await Sharing.shareAsync(f.uri, {
    mimeType: "image/svg+xml",
    UTI: "public.svg-image",
  });
}
