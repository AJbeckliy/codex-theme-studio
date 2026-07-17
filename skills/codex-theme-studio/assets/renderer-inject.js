((cssText, theme, heroDataUrl, cornerLeftDataUrl, cornerRightDataUrl, iconDataUrl) => {
  const STATE_KEY = "__CODEX_THEME_STUDIO_STATE__";
  const STYLE_ID = "codex-theme-studio-style";
  const CHROME_ID = "codex-theme-chrome";
  const HOME_ACTIONS_ID = "theme-home-actions";
  const ROOT_CLASS = "codex-theme-studio";
  const HOME_CLASS = "theme-home";
  const HOME_SHELL_CLASS = "theme-home-shell";
  window.__CODEX_DREAM_SKIN_STATE__?.cleanup?.();
  document.documentElement?.classList.remove("codex-dream-skin");
  document.getElementById("codex-dream-skin-style")?.remove();
  document.getElementById("codex-dream-skin-chrome")?.remove();
  const previous = window[STATE_KEY];
  if (previous?.cleanup) previous.cleanup();
  window.__CODEX_THEME_STUDIO_DISABLED__ = false;

  const objectUrl = (dataUrl) => {
    const [header, encoded] = dataUrl.split(",", 2);
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const type = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
    return URL.createObjectURL(new Blob([bytes], { type }));
  };

  const urls = {
    hero: objectUrl(heroDataUrl),
    cornerLeft: objectUrl(cornerLeftDataUrl),
    cornerRight: objectUrl(cornerRightDataUrl),
    icon: objectUrl(iconDataUrl),
  };
  const variableNames = [
    "--theme-hero", "--theme-corner-left", "--theme-corner-right", "--theme-icon",
    "--theme-ink", "--theme-muted", "--theme-primary", "--theme-secondary",
    "--theme-accent", "--theme-danger", "--theme-background", "--theme-surface",
    "--theme-line", "--theme-hero-subtitle", "--theme-project-label", "--theme-hero-position",
    "--theme-hero-height", "--theme-hero-size",
  ];

  const fillComposer = (prompt) => {
    const editor = document.querySelector('.ProseMirror[contenteditable="true"]');
    if (!editor) return false;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    const beforeInput = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: prompt });
    if (editor.dispatchEvent(beforeInput)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = prompt;
      editor.replaceChildren(paragraph);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    }
    return editor.innerText.trim() === prompt;
  };

  const findNativeIcon = (label) => [...document.querySelectorAll("aside.app-shell-left-panel button")]
    .find((node) => node.innerText?.split("\n", 1)[0]?.trim() === label)
    ?.querySelector("svg")
    ?.cloneNode(true);

  const createHomeActions = () => {
    const section = document.createElement("section");
    section.id = HOME_ACTIONS_ID;
    section.setAttribute("aria-label", theme.copy.actionsLabel || "Theme shortcuts");
    for (const action of theme.homeActions || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-home-action";
      button.addEventListener("click", () => fillComposer(action.prompt));

      const icon = document.createElement("span");
      icon.className = "theme-home-action-icon";
      const nativeIcon = findNativeIcon(action.iconSource);
      if (nativeIcon) icon.appendChild(nativeIcon);

      const copy = document.createElement("span");
      copy.className = "theme-home-action-copy";
      const title = document.createElement("strong");
      title.textContent = action.title;
      const detail = document.createElement("small");
      detail.textContent = action.detail;
      copy.append(title, detail);
      button.append(icon, copy);
      section.appendChild(button);
    }
    return section;
  };

  const createChrome = () => {
    const chrome = document.createElement("div");
    chrome.id = CHROME_ID;
    chrome.setAttribute("aria-hidden", "true");

    const brand = document.createElement("div");
    brand.className = "theme-brand";
    const brandIcon = document.createElement("span");
    brandIcon.className = "theme-brand-icon";
    const brandCopy = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = theme.copy.brandTitle;
    const subtitle = document.createElement("small");
    subtitle.textContent = theme.copy.brandSubtitle;
    brandCopy.append(title, subtitle);
    brand.append(brandIcon, brandCopy);

    const sparks = document.createElement("div");
    sparks.className = "theme-sparks";
    for (let index = 0; index < 4; index += 1) sparks.appendChild(document.createElement("i"));
    const left = document.createElement("div");
    left.className = "theme-corner theme-corner-left";
    const right = document.createElement("div");
    right.className = "theme-corner theme-corner-right";
    chrome.append(brand, sparks, left, right);
    return chrome;
  };

  const ensure = () => {
    if (window.__CODEX_THEME_STUDIO_DISABLED__) return;
    const root = document.documentElement;
    if (!root) return;
    root.classList.add(ROOT_CLASS);
    root.style.setProperty("--theme-hero", `url("${urls.hero}")`);
    root.style.setProperty("--theme-corner-left", `url("${urls.cornerLeft}")`);
    root.style.setProperty("--theme-corner-right", `url("${urls.cornerRight}")`);
    root.style.setProperty("--theme-icon", `url("${urls.icon}")`);
    const paletteVariables = {
      ink: "--theme-ink", muted: "--theme-muted", primary: "--theme-primary",
      secondary: "--theme-secondary", accent: "--theme-accent", danger: "--theme-danger",
      background: "--theme-background", surface: "--theme-surface", line: "--theme-line",
    };
    for (const [key, variable] of Object.entries(paletteVariables)) {
      root.style.setProperty(variable, theme.palette[key]);
    }
    root.style.setProperty("--theme-hero-subtitle", JSON.stringify(theme.copy.heroSubtitle));
    root.style.setProperty("--theme-project-label", JSON.stringify(theme.copy.projectLabel));
    root.style.setProperty("--theme-hero-position", theme.layout.heroPosition || "right 60%");
    root.style.setProperty("--theme-hero-height", `${theme.layout.heroHeight || 252}px`);
    root.style.setProperty("--theme-hero-size", theme.layout.heroSize || "auto 138%");

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    const themeKey = `${theme.id}@${theme.version}`;
    if (style.dataset.themeKey !== themeKey) {
      style.textContent = cssText;
      style.dataset.themeKey = themeKey;
    }

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll(`[role="main"].${HOME_CLASS}`)) {
      if (candidate !== home) candidate.classList.remove(HOME_CLASS);
    }
    if (home) home.classList.add(HOME_CLASS);

    let actions = document.getElementById(HOME_ACTIONS_ID);
    if (home && !actions && theme.homeActions?.length) {
      actions = createHomeActions();
      home.appendChild(actions);
    } else if (!home) {
      actions?.remove();
    }
    if (!shellMain || !document.body) return;
    shellMain.classList.toggle(HOME_SHELL_CLASS, Boolean(home));

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = createChrome();
      document.body.appendChild(chrome);
    }
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle(HOME_SHELL_CLASS, Boolean(home));
  };

  const scheduler = { timeout: null };
  const cleanup = () => {
    window.__CODEX_THEME_STUDIO_DISABLED__ = true;
    document.documentElement?.classList.remove(ROOT_CLASS);
    for (const variable of variableNames) document.documentElement?.style.removeProperty(variable);
    document.querySelectorAll(`.${HOME_CLASS}`).forEach((node) => node.classList.remove(HOME_CLASS));
    document.querySelectorAll(`.${HOME_SHELL_CLASS}`).forEach((node) => node.classList.remove(HOME_SHELL_CLASS));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(HOME_ACTIONS_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    Object.values(state?.urls || {}).forEach((url) => URL.revokeObjectURL(url));
    delete window[STATE_KEY];
    return true;
  };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(ensure, 5000);
  const version = `${theme.id}@${theme.version}`;
  window[STATE_KEY] = { ensure, cleanup, observer, timer, scheduler, urls, version, theme };
  ensure();
  return { installed: true, version };
})(__THEME_CSS_JSON__, __THEME_JSON__, __THEME_HERO_JSON__, __THEME_CORNER_LEFT_JSON__, __THEME_CORNER_RIGHT_JSON__, __THEME_ICON_JSON__)
