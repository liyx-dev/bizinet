// ============================================================
//  BiziNet · Modular Command Sidebar Interface Router Engine
//  dashboard/js/sidebar.js
// ============================================================

document.addEventListener("DOMContentLoaded", function () {
  const triggerBtn  = document.getElementById("sidebarTrigger");
  const closeBtn    = document.getElementById("sidebarCloseBtn");
  const backdrop    = document.getElementById("sidebarBackdrop");
  const sidebar     = document.getElementById("bizinetSidebar");

  // Interaction Mapping Event Selectors
  const btnInviteTeam = document.getElementById("sideBtnInviteTeam");
  const btnLogout     = document.getElementById("sideBtnLogout");

  // Toggle Functionality Controls
  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("active");
    document.body.style.overflow = "hidden"; // Locks back-scrolling safely
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("active");
    document.body.style.overflow = ""; // Restores base track scrolling smoothly
  }

  // Bind Event Listeners
  if (triggerBtn) triggerBtn.addEventListener("click", openSidebar);
  if (closeBtn)   closeBtn.addEventListener("click", closeSidebar);
  if (backdrop)   backdrop.addEventListener("click", closeSidebar);

  // Keyboard accessibility check escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSidebar();
  });

  // ============================================================
  // SIDEBAR NAVIGATION ACTIONS (Integrated via global.js routing)
  // ============================================================

  if (btnInviteTeam) {
    btnInviteTeam.addEventListener("click", function () {
      closeSidebar();
      // Target workspace configuration route safely mapping inside your framework
      safeNavigate("dashboard/team-invite"); 
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", async function () {
      try {
        // Clear active session flags through Supabase auth client
        if (window.APP_CLIENT && window.APP_CLIENT.auth) {
          await window.APP_CLIENT.auth.signOut();
        }
        closeSidebar();
        // Route back safely using your global.js helper function
        goAuth();
      } catch (err) {
        console.error("[BiziSidebar] Authorization termination process failed:", err);
        goAuth();
      }
    });
  }
});
