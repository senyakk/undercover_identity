const drawForm = document.querySelector("#drawForm");
const statusLine = document.querySelector("#statusLine");
const resultBox = document.querySelector("#resultBox");
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

async function runResetAction({ action, button, workingLabel, successTitle, successMessage }) {
  const originalLabel = button.textContent;
  const form = new FormData(drawForm);
  button.disabled = true;
  button.textContent = workingLabel;

  try {
    const response = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminSecret: form.get("adminSecret"), action })
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
