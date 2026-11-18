chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message !== "readLegacySettings") return;
  const settings = {};
  for (const key of Object.keys(localStorage)) {
    if (!/^opts_(enabled|external_link_only|contextmenu_enabled)_default$/.test(key)
        && !/^\d+$/.test(key)) continue;
    const raw = localStorage.getItem(key);
    try {
      settings[key] = JSON.parse(raw);
    } catch (error) {
      console.warn("Skipping invalid legacy setting", key, error);
    }
  }
  reply(settings);
});
