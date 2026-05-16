const drawForm = document.querySelector("#drawForm");
const statusLine = document.querySelector("#statusLine");
const resultBox = document.querySelector("#resultBox");
const rosterButton = document.querySelector("#rosterButton");
const rolesButton = document.querySelector("#rolesButton");
const removeAgentButton = document.querySelector("#removeAgentButton");
const clearDrawButton = document.querySelector("#clearDrawButton");
const redrawButton = document.querySelector("#redrawButton");
const clearRosterButton = document.querySelector("#clearRosterButton");

refreshState();

drawForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = drawForm.querySelector("button[type='submit']");
  const form = new FormData(drawForm);
  button.disabled = true;
  button.textContent = "Assigning...";

  try {
    const response = await fetch("/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminSecret: form.get("adminSecret") })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Draw failed");

    resultBox.className = "result";
    resultBox.innerHTML = `
      <h3>Draw sealed</h3>
      <p>${data.participantCount} agents assigned. No assignments were printed to this page.</p>
      <p class="microcopy">Guests can open their saved reveal links now.</p>
    `;
    await refreshState();
  } catch (error) {
    resultBox.className = "result";
    resultBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Run draw";
  }
});

rosterButton.addEventListener("click", async () => {
  if (!drawForm.reportValidity()) return;

  const originalLabel = rosterButton.textContent;
  const form = new FormData(drawForm);
  rosterButton.disabled = true;
  rosterButton.textContent = "Loading...";

  try {
    const response = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminSecret: form.get("adminSecret") })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Roster unavailable");

    resultBox.className = "result";
    resultBox.innerHTML = `
      <h3>Registered agents</h3>
      ${data.names.length ? `<ol class="roster-list">${data.names.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ol>` : "<p>No agents registered yet.</p>"}
    `;
    await refreshState();
  } catch (error) {
    resultBox.className = "result";
    resultBox.textContent = error.message;
  } finally {
    rosterButton.disabled = false;
    rosterButton.textContent = originalLabel;
  }
});

rolesButton.addEventListener("click", async () => {
  if (!drawForm.reportValidity()) return;

  const originalLabel = rolesButton.textContent;
  const form = new FormData(drawForm);
  rolesButton.disabled = true;
  rolesButton.textContent = "Loading...";

  try {
    const response = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminSecret: form.get("adminSecret") })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Role count unavailable");

    resultBox.className = "result";
    resultBox.innerHTML = `
      <h3>Role pool</h3>
      <dl>
        <div><dt>Total roles</dt><dd>${data.totalRoles}</dd></div>
        <div><dt>Single roles</dt><dd>${data.singleRoles}</dd></div>
        <div><dt>Pair roles</dt><dd>${data.pairedRoles}</dd></div>
        <div><dt>Role groups</dt><dd>${data.groups}</dd></div>
        <div><dt>Currently assigned</dt><dd>${data.usedRoles}</dd></div>
        <div><dt>Currently unused</dt><dd>${data.unusedRoles}</dd></div>
      </dl>
    `;
    await refreshState();
  } catch (error) {
    resultBox.className = "result";
    resultBox.textContent = error.message;
  } finally {
    rolesButton.disabled = false;
    rolesButton.textContent = originalLabel;
  }
});

removeAgentButton.addEventListener("click", async () => {
  if (!drawForm.reportValidity()) return;
  const form = new FormData(drawForm);
  const name = String(form.get("removeName") || "").trim();
  if (!name) {
    resultBox.className = "result";
    resultBox.textContent = "Enter the exact registered name to remove.";
    return;
  }
  if (!confirm(`Remove "${name}" from the roster and delete their reveal link?`)) return;

  await runResetAction({
    action: "removeParticipant",
    button: removeAgentButton,
    workingLabel: "Removing...",
    extraData: { name },
    successTitle: "Agent removed",
    successMessage: (data) =>
      `${data.removedName} was removed. ${data.participantCount} agents remain.${data.drawComplete ? " The draw had already happened, so consider redrawing if this affected a pair role." : ""}`
  });
  drawForm.elements.removeName.value = "";
});

clearDrawButton.addEventListener("click", async () => {
  if (!drawForm.reportValidity()) return;
  if (!confirm("Discard the current assignments but keep every signed up agent and reveal link? Guests will wait until you run a new draw.")) return;

  await runResetAction({
    action: "clearDraw",
    button: clearDrawButton,
    workingLabel: "Discarding...",
    successTitle: "Draw discarded",
    successMessage: (data) =>
      `${data.assignmentCount} assignments were discarded. ${data.participantCount} signed up agents are still registered.`
  });
});

redrawButton.addEventListener("click", async () => {
  if (!drawForm.reportValidity()) return;
  if (!confirm("Discard the current assignments and redraw for every signed up agent? Existing reveal links will show new roles.")) return;

  await runResetAction({
    action: "redraw",
    button: redrawButton,
    workingLabel: "Redrawing...",
    successTitle: "Draw replaced",
    successMessage: (data) => `${data.participantCount} agents were assigned new roles. Existing reveal links now show the new draw.`
  });
});

clearRosterButton.addEventListener("click", async () => {
  if (!drawForm.reportValidity()) return;
  if (!confirm("Discard every signed up agent, reveal link, and assignment? This cannot be undone.")) return;

  await runResetAction({
    action: "clearRoster",
    button: clearRosterButton,
    workingLabel: "Discarding...",
    successTitle: "Roster cleared",
    successMessage: (data) =>
      `${data.participantCount} agents, ${data.revealCount} reveal links, and ${data.assignmentCount} assignments were discarded.`
  });
});

async function refreshState() {
  try {
    const response = await fetch("/api/state");
    const data = await response.json();
    statusLine.textContent = data.drawComplete
      ? `Draw complete. ${data.participantCount} agents assigned.`
      : `${data.participantCount} agent${data.participantCount === 1 ? "" : "s"} registered.`;
  } catch {
    statusLine.textContent = "Agency channel offline.";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function runResetAction({ action, button, workingLabel, successTitle, successMessage, extraData = {} }) {
  const originalLabel = button.textContent;
  const form = new FormData(drawForm);
  button.disabled = true;
  button.textContent = workingLabel;

  try {
    const response = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminSecret: form.get("adminSecret"), action, ...extraData })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Admin action failed");

    resultBox.className = "result";
    resultBox.innerHTML = `
      <h3>${successTitle}</h3>
      <p>${successMessage(data)}</p>
    `;
    await refreshState();
  } catch (error) {
    resultBox.className = "result";
    resultBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}
