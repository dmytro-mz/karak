// Tiny DOM helpers: element builders (HTML + SVG), toasts, dialogs, clipboard.

function build(el, attrs, children) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.setAttribute("class", value);
    else if (key === "style" && typeof value === "object") {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith("--")) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "value") el.value = value;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function h(tag, attrs = {}, ...children) {
  return build(document.createElement(tag), attrs, children);
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...children) {
  return build(document.createElementNS(SVG_NS, tag), attrs, children);
}

export function toast(message, error = false) {
  const box = document.getElementById("toasts");
  const el = h("div", { class: `toast${error ? " err" : ""}` }, message);
  box.append(el);
  setTimeout(() => el.remove(), 3200);
}

// A modal dialog on top of everything. Returns a function that closes it.
export function openDialog(content, { dismissable = true, onClose } = {}) {
  const backdrop = h("div", { class: "backdrop" }, content);
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape" && dismissable) close();
  };
  if (dismissable) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
  }
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  const focus = content.querySelector("input, button.primary");
  focus?.focus();
  return close;
}

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  // Plain-http LAN addresses are not a secure context, so the async clipboard API is missing.
  const area = h("textarea", { style: { position: "fixed", opacity: "0", top: "0" } });
  area.value = text;
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
