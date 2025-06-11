import { saveCustomConfig, DomainConfig } from "./rules";

// Show message to user
function showMessage(text: string, type: "success" | "error") {
  const messageEl = document.getElementById("message");
  if (!messageEl) return;
  
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  
  setTimeout(() => {
    messageEl.textContent = "";
    messageEl.className = "";
  }, 3000);
}

// Handle form submission
document.getElementById("config-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  
  const domain = formData.get("domain") as string;
  const selector = formData.get("selector") as string;
  const removeText = formData.get("remove") as string;
  
  // Parse remove selectors (one per line)
  const remove = removeText
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  const config: DomainConfig = {
    selector,
    ...(remove.length > 0 && { remove })
  };
  
  try {
    await saveCustomConfig(domain, config);
    showMessage(`Configuration saved for ${domain}`, "success");
    form.reset();
  } catch (error) {
    showMessage("Failed to save configuration", "error");
    console.error(error);
  }
});

// Handle reset button
document.getElementById("reset")?.addEventListener("click", async () => {
  if (confirm("This will remove all custom configurations. Continue?")) {
    try {
      await chrome.storage.sync.remove("domainConfigs");
      showMessage("Reset to default configurations", "success");
    } catch (error) {
      showMessage("Failed to reset configurations", "error");
      console.error(error);
    }
  }
});