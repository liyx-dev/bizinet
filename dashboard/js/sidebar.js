// ============================================================
// BiziPlex Sidebar Workspace Engine
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

  const sidebar = document.getElementById("bizinetSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");

  const workspace =
    document.getElementById("sidebarModuleWorkspace");

  const container =
    document.getElementById("sidebarModuleContainer");

  const dashboardHome =
    document.querySelector(".admin-wrapper");

  const moduleCache = {};

  const loadedScripts = new Set();

  const sidebarModules = {

    inviteTeam: {
      html: "views/invite-team.html",
      js: "js/invite-team.js"
    },

    billing: {
      html: "views/billing.html",
      js: "js/billing.js"
    },

    upgrade: {
      html: "views/upgrade.html",
      js: "js/upgrade.js"
    },

    notifications: {
      html: "views/notifications.html",
      js: "js/notifications.js"
    },

    domains: {
      html: "views/domains.html",
      js: "js/domains.js"
    },

    analytics: {
      html: "views/analytics.html",
      js: "js/analytics.js"
    }
  };

  function openSidebar() {
    sidebar?.classList.add("open");
    backdrop?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    sidebar?.classList.remove("open");
    backdrop?.classList.remove("active");
    document.body.style.overflow = "";
  }

  window.openSidebar = openSidebar;
  window.closeSidebar = closeSidebar;

  async function loadModuleScript(url) {

    if (loadedScripts.has(url))
      return;

    return new Promise((resolve, reject) => {

      const script = document.createElement("script");

      script.src = url;

      script.onload = () => {
        loadedScripts.add(url);
        resolve();
      };

      script.onerror = reject;

      document.body.appendChild(script);

    });
  }

  async function openSidebarModule(moduleKey) {

    const module = sidebarModules[moduleKey];

    if (!module) return;

    closeSidebar();

    dashboardHome.style.display = "none";

    workspace.style.display = "block";

    try {

      if (!moduleCache[moduleKey]) {

        const response =
          await fetch(module.html);

        const html =
          await response.text();

        moduleCache[moduleKey] = html;
      }

      container.innerHTML =
        moduleCache[moduleKey];

      await loadModuleScript(module.js);

      const initFunction =
        window[`init${moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1)}Module`];

      if (typeof initFunction === "function") {
        initFunction();
      }

    } catch (err) {

      console.error(err);

      container.innerHTML = `
        <div class="module-error">
          Failed to load module.
        </div>
      `;
    }
  }

  window.openSidebarModule =
    openSidebarModule;

  window.goDashboardHome = function() {

    workspace.style.display = "none";

    dashboardHome.style.display = "";
  };

  document
    .getElementById("sideBtnInviteTeam")
    ?.addEventListener("click", () =>
      openSidebarModule("inviteTeam"));

  document
    .getElementById("sideBtnBilling")
    ?.addEventListener("click", () =>
      openSidebarModule("billing"));

  document
    .getElementById("sideBtnUpgrade")
    ?.addEventListener("click", () =>
      openSidebarModule("upgrade"));

  document
    .getElementById("sideBtnNotifications")
    ?.addEventListener("click", () =>
      openSidebarModule("notifications"));

  document
    .getElementById("sideBtnDomains")
    ?.addEventListener("click", () =>
      openSidebarModule("domains"));

  document
    .getElementById("sideBtnAnalytics")
    ?.addEventListener("click", () =>
      openSidebarModule("analytics"));

  document
    .getElementById("sideBtnLogout")
    ?.addEventListener("click", async () => {

      try {

        if (
          window.APP_CLIENT?.auth
        ) {
          await window.APP_CLIENT.auth.signOut();
        }

      } catch (err) {
        console.error(err);
      }

      goAuth();

    });

});
