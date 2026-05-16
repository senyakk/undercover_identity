const drawForm = document.querySelector("#drawForm");
const statusLine = document.querySelector("#statusLine");
const resultBox = document.querySelector("#resultBox");

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
