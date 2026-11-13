// App shell: hash routes + bottom tab bar. Routes are plain `#name` only (no params, no slashes).
// The tab bar is mounted ONCE on <body> (outside the animating screen, so position:fixed is reliable —
// DESIGN rule 9) and only its active state changes, so the indicator can slide instead of re-rendering.
export const TABS = [
  { id: 'plan', label: 'Plan', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/><circle cx="12" cy="12" r="2.2"/>' },
  { id: 'timeline', label: 'Timeline', icon: '<path d="M3.5 12h17"/><circle cx="6.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="17.5" cy="12" r="2"/>' },
  { id: 'budget', label: 'Budget', icon: '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M15.5 14.5h2"/>' },
  { id: 'scenarios', label: 'Scenarios', icon: '<path d="M12 4l8 4-8 4-8-4 8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>' },
  { id: 'settings', label: 'Settings', icon: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>' },
];
// Non-tab routes and the tab they belong to (keeps the tab highlighted while drilled in).
export const SUB_ROUTES = { answers: 'settings' };
export const ROUTES = [...TABS.map((t) => t.id), ...Object.keys(SUB_ROUTES)];

// '#plan' -> 'plan'; anything else (empty, unknown, '#a/b', '#x?y') -> null.
export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#/, '');
  return ROUTES.includes(h) ? h : null;
}
export function tabOf(route) {
  return SUB_ROUTES[route] || (TABS.some((t) => t.id === route) ? route : null);
}
export function tabIndex(route) {
  return TABS.findIndex((t) => t.id === tabOf(route));
}
// Slide direction between two routes: tabs slide by position; drilling in goes forward, out goes back.
export function slideDir(from, to) {
  if (!from || from === to) return 'none';
  if (SUB_ROUTES[to] && tabOf(to) === tabOf(from)) return 'fwd';
  if (SUB_ROUTES[from] && tabOf(from) === tabOf(to)) return 'back';
  const a = tabIndex(from), b = tabIndex(to);
  if (a < 0 || b < 0) return 'fwd';
  return b >= a ? 'fwd' : 'back';
}

export function tabBarHTML() {
  return `<div class="tb-ind" aria-hidden="true"></div>` + TABS.map((t, i) =>
    `<a class="tb" href="#${t.id}" data-tab="${t.id}" style="--i:${i}"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${t.label}</span></a>`).join('');
}

// Mount (once) and update the tab bar. visible=false hides it during onboarding.
export function syncTabBar(route, visible) {
  let nav = document.getElementById('tabbar');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'tabbar';
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = tabBarHTML();
    document.body.appendChild(nav);
  }
  nav.hidden = !visible;
  document.body.classList.toggle('has-tabbar', !!visible);
  const tab = tabOf(route);
  const idx = tabIndex(route);
  if (idx >= 0) nav.style.setProperty('--x', String(idx));
  nav.querySelectorAll('.tb').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
