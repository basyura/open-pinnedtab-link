/** -*- coding: utf-8; mode: css -*-
   *
   * Copyright (C) 2011-2012 Yasuhiro ABE <yasu@yasundial.org>
   *
   */

const fields = {
  opts_enabled_default: "enabled",
  opts_external_link_only_default: "exclude_same_hostname",
  opts_contextmenu_enabled_default: "contextmenu_enabled"
};

async function refresh(action, settings) {
  const data = await chrome.runtime.sendMessage({action, settings});
  if (data.error) throw new Error(data.error);
  for (const [key, name] of Object.entries(fields)) {
    for (const input of document.getElementsByName(name)) {
      input.checked = input.value === String(data.settings[key]);
    }
  }
  const table = document.getElementById("localdata_table");
  while (table.rows.length > 1) table.deleteRow(1);
  for (const [key, value] of Object.entries({...data.settings, ...data.tabs})) {
    const row = table.insertRow();
    row.insertCell().textContent = key;
    row.insertCell().textContent = JSON.stringify(value);
  }
}

function save_options() {
  const settings = {};
  for (const [key, name] of Object.entries(fields)) {
    settings[key] = document.querySelector('input[name="' + name + '"]:checked').value === "true";
  }
  return refresh("save", settings);
}

function set_text() {
  var list = new Array("top_title", "opts_title","opts_title_enabled","opts_title_exclude","opts_button_reset","opts_button_save","localdata_table_title", "localdata_button_removeall", "localdata_table_label_keys", "localdata_table_label_values", "opts_header_title", "opts_header_true", "opts_header_false", "opts_note","localdata_note","opts_contextmenu_enabled", "opts_header_title2", "opts_header_true2", "opts_header_false2");
  for(var i=0; i < list.length; i++) {
    var e = document.getElementById(list[i]);
    var t = document.createTextNode(chrome.i18n.getMessage(list[i]));
    e.appendChild(t);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  set_text();
  await refresh("read");
  document.querySelector("#opts_button_reset").addEventListener("click", () => refresh("read"));
  document.querySelector("#opts_button_save").addEventListener("click", save_options);
  document.querySelector("#localdata_button_removeall").addEventListener("click", () => refresh("clear"));
});
