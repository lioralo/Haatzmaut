import { state, isAdmin } from '../core/store.js';
import { byId } from '../core/utils.js';

export function updateMobileActive(tabId) {
  const mobileNav = byId("mobileNav");
  if (!mobileNav) return;
  mobileNav.querySelectorAll(".mobile-nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.tab === tabId);
  });
}

function updateMobileLangLabel() {
  const lang = window.__APP_LANG__ || 'he';
  const label = byId("mobileLangLabel");
  if (label) label.textContent = lang === "he" ? "English" : "עברית";
}

export function syncMobileBadges() {
  const reqCount = (state.requests || []).filter(r => r.status === "pending").length;
  const issCount = (state.issues || []).filter(i => i.status !== "resolved" && i.status !== "closed").length;

  const reqBadge = byId("mobileRequestsBadge");
  if (reqBadge) {
    reqBadge.textContent = reqCount;
    reqBadge.classList.toggle("hidden", reqCount === 0);
  }
  const issBadge = byId("mobileIssuesBadge");
  if (issBadge) {
    issBadge.textContent = issCount;
    issBadge.classList.toggle("hidden", issCount === 0);
  }
}

function updateMobileAdminVisibility() {
  const adminItem = byId("mobileAdminItem");
  if (adminItem) {
    adminItem.style.display = isAdmin() ? "" : "none";
  }
}

export function syncMobileState() {
  updateMobileActive(state.activeTab);
  syncMobileBadges();
  updateMobileAdminVisibility();
}

export function initMobileNav({ showTab, renderActiveTab, switchLang }) {
  const mobileNav = byId("mobileNav");
  const moreBtn = byId("mobileMoreBtn");
  const drawer   = byId("mobileMoreDrawer");
  const overlay  = byId("mobileMoreOverlay");
  const closeBtn = byId("mobileMoreClose");
  if (!mobileNav) return;

  function closeDrawer() {
    drawer?.classList.remove("open");
    moreBtn?.setAttribute("aria-expanded", "false");
  }

  function openDrawer() {
    drawer?.classList.add("open");
    moreBtn?.setAttribute("aria-expanded", "true");
  }

  function navigateToTab(tabId) {
    if (!tabId) return;
    if ((tabId === "adminTab" || tabId === "staffTab") && !isAdmin()) return;
    showTab(tabId);
    renderActiveTab();
    updateMobileActive(tabId);
  }

  mobileNav.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => navigateToTab(btn.dataset.tab));
  });

  moreBtn?.addEventListener("click", () => {
    drawer?.classList.contains("open") ? closeDrawer() : openDrawer();
  });

  overlay?.addEventListener("click", closeDrawer);
  closeBtn?.addEventListener("click", closeDrawer);

  drawer?.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeDrawer();
      navigateToTab(btn.dataset.tab);
    });
  });

  byId("mobileLangSwitch")?.addEventListener("click", () => {
    switchLang();
    updateMobileLangLabel();
    closeDrawer();
    renderActiveTab();
  });
}
