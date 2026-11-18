// Copyright (C) 2011 Yasuhiro ABE. Licensed under the Apache License, Version 2.0.
const defaults = {
  opts_enabled_default: true,
  opts_external_link_only_default: false,
  opts_contextmenu_enabled_default: true
};
const menus = {enabled: "menu_enabled", external_link_only: "menu_exclude"};

async function migrate() {
  if ((await chrome.storage.local.get("migrated")).migrated) return;
  if (!(await chrome.runtime.getContexts({contextTypes: ["OFFSCREEN_DOCUMENT"]})).length) {
    await chrome.offscreen.createDocument({
      url: "migration.html", reasons: ["LOCAL_STORAGE"],
      justification: "Import settings saved by the previous extension version."
    });
  }
  try {
    const legacy = await chrome.runtime.sendMessage("readLegacySettings");
    const settings = {...defaults};
    for (const key of Object.keys(defaults)) {
      if (typeof legacy[key] === "boolean") settings[key] = legacy[key];
    }
    const tabs = {};
    for (const tab of await chrome.tabs.query({pinned: true})) {
      const state = legacy[tab.id];
      if (typeof state?.enabled === "boolean" && typeof state.external_link_only === "boolean") {
        tabs[tab.id] = {enabled: state.enabled, external_link_only: state.external_link_only};
      }
    }
    await chrome.storage.session.set(tabs);
    await chrome.storage.local.set({...settings, migrated: true});
  } finally {
    await chrome.offscreen.closeDocument();
  }
}

function updateLinks(enabled, externalOnly) {
  for (const link of document.getElementsByTagName("a")) {
    if (enabled && !["http:", "https:"].includes(link.protocol)) continue;
    link.target = enabled && (!externalOnly || link.hostname !== location.hostname) ? "_blank" : "";
  }
}

async function apply(tab, state) {
  if (!/^https?:\/\//.test(tab.url)) return;
  try {
    await chrome.scripting.executeScript({
      target: {tabId: tab.id}, func: updateLinks, args: [state.enabled, state.external_link_only]
    });
  } catch (error) {
    // A tab can close, navigate, or be protected by Chrome between query and injection.
    console.warn("Could not update links in tab", tab.id, error.message);
  }
}

async function tabState(tab, settings) {
  const key = String(tab.id);
  const saved = (await chrome.storage.session.get(key))[key];
  if (!tab.pinned) {
    if (saved) {
      await chrome.storage.session.remove(key);
      if (saved.enabled) await apply(tab, {enabled: false, external_link_only: false});
    }
    return;
  }
  if (saved) return saved;
  const state = {enabled: settings.opts_enabled_default, external_link_only: settings.opts_external_link_only_default};
  await chrome.storage.session.set({[key]: state});
  return state;
}

async function syncTab(tab) {
  const settings = await chrome.storage.local.get(defaults);
  const state = await tabState(tab, settings);
  if (state?.enabled) await apply(tab, state);
}

async function syncMenus() {
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  const settings = await chrome.storage.local.get(defaults);
  const state = tab?.pinned && await tabState(tab, settings);
  for (const id of Object.keys(menus)) {
    await chrome.contextMenus.update(id, {
      visible: settings.opts_contextmenu_enabled_default, enabled: Boolean(state), checked: Boolean(state?.[id])
    });
  }
}

async function initialize() {
  await migrate();
  await chrome.contextMenus.removeAll();
  for (const [id, key] of Object.entries(menus)) {
    await new Promise((resolve, reject) => {
      chrome.contextMenus.create({id, title: chrome.i18n.getMessage(key), type: "checkbox"}, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  await syncMenus();
}

// Serialize updates so older tab events cannot overwrite a newer menu click.
let ready = false;
let pending = Promise.resolve();
function run(action) {
  const result = pending.then(async () => {
    if (!ready) {
      await initialize();
      ready = true;
    }
    return action();
  });
  pending = result.catch(error => console.error(error));
  return result;
}

async function syncPinned() {
  for (const tab of await chrome.tabs.query({pinned: true})) await syncTab(tab);
  await syncMenus();
}

chrome.runtime.onInstalled.addListener(() => { run(syncPinned); });
chrome.runtime.onStartup.addListener(() => { run(syncPinned); });
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.pinned === undefined && change.url === undefined && change.status !== "complete") return;
  run(async () => {
    await syncTab(tab);
    if (tab.active) await syncMenus();
  });
});
chrome.tabs.onActivated.addListener(() => { run(syncMenus); });
chrome.windows.onFocusChanged.addListener(() => { run(syncMenus); });
chrome.tabs.onRemoved.addListener(id => { run(() => chrome.storage.session.remove(String(id))); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.pinned || !Object.hasOwn(menus, info.menuItemId)) return;
  run(async () => {
    const state = await tabState(tab, await chrome.storage.local.get(defaults));
    state[info.menuItemId] = info.checked;
    await chrome.storage.session.set({[tab.id]: state});
    if (state.enabled || info.menuItemId === "enabled") await apply(tab, state);
    await syncMenus();
  });
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.url?.split(/[?#]/, 1)[0] !== chrome.runtime.getURL("options.html")) return;
  run(async () => {
    if (message.action === "save") {
      const settings = {};
      for (const key of Object.keys(defaults)) {
        if (typeof message.settings?.[key] !== "boolean") throw new Error("Invalid setting: " + key);
        settings[key] = message.settings[key];
      }
      await chrome.storage.local.set(settings);
      await syncMenus();
    }
    if (message.action === "clear") {
      await chrome.storage.session.clear();
      await chrome.storage.local.set(defaults);
      await syncPinned();
    }
    return {settings: await chrome.storage.local.get(defaults), tabs: await chrome.storage.session.get(null)};
  }).then(reply, error => reply({error: error.message}));
  return true;
});
