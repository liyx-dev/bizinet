// ============================================================
//  BiziPlex · Invite Team Module Engine
//  invite-team.js
// ============================================================

let teamState = {
  members: [],
  invites: [],
  capacity: {
    used: 0,
    limit: 0
  },
  insights: [],
  insightIndex: 0
};

// ============================================================
//  INIT
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.APP_RUNTIME_READY;

    bindUIActions();
    await loadTeamDashboard();

    // realtime sync hook (safe with runtime.js lock system)
    setInterval(() => {
      refreshTeamData();
    }, 15000);

  } catch (err) {
    console.error("[TeamModule] Init failed:", err);
    toast("Failed to load team module", "error");
  }
});

// ============================================================
//  UI BINDINGS
// ============================================================

function bindUIActions() {
  const form = document.getElementById("inviteTeamForm");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sendInvitation();
  });

  document.getElementById("copyJoinPortalBtn")?.addEventListener("click", copyJoinLink);
  document.getElementById("refreshTeamBtn")?.addEventListener("click", refreshTeamData);
}

// ============================================================
//  LOAD DASHBOARD DATA
// ============================================================

async function loadTeamDashboard() {
  try {
    const { data, error } = await window.APP_CLIENT.rpc("get_team_dashboard");

    if (error) throw error;

    if (!data) return;

    const d = data;

    teamState.members = d.members || [];
    teamState.invites = d.invites || [];
    teamState.capacity = d.capacity || { used: 0, limit: 0 };
    teamState.insights = d.insights || [];

    renderOverview();
    renderCapacity();
    renderMembers();
    renderInvites();
    startInsightRotation();

  } catch (err) {
    console.error("[TeamModule] loadTeamDashboard error:", err);
    toast("Could not load team data", "error");
  }
}

// ============================================================
//  REFRESH (SAFE FROM runtime.js LOCK)
// ============================================================

async function refreshTeamData() {
  try {
    await window.refreshLiveMetrics();
    await loadTeamDashboard();
  } catch (err) {
    console.error("[TeamModule] refresh failed:", err);
  }
}

// ============================================================
//  OVERVIEW METRICS
// ============================================================

function renderOverview() {
  document.getElementById("teamMemberCount").textContent =
    teamState.members.length || 0;

  document.getElementById("pendingInviteCount").textContent =
    teamState.invites.length || 0;

  document.getElementById("availableSlotsCount").textContent =
    Math.max(teamState.capacity.limit - teamState.capacity.used, 0);

  document.getElementById("planLimitCount").textContent =
    teamState.capacity.limit || 0;
}

// ============================================================
//  CAPACITY BAR
// ============================================================

function renderCapacity() {
  const used = teamState.capacity.used || 0;
  const limit = teamState.capacity.limit || 1;

  const percent = Math.min((used / limit) * 100, 100);

  const fill = document.getElementById("capacityProgress");
  const label = document.getElementById("capacityLabel");
  const pct = document.getElementById("capacityPercentage");

  if (fill) fill.style.width = `${percent}%`;

  if (label) label.textContent = `${used} / ${limit} members`;
  if (pct) pct.textContent = `${Math.round(percent)}% used`;
}

// ============================================================
//  TEAM MEMBERS RENDER
// ============================================================

function renderMembers() {
  const container = document.getElementById("teamMembersContainer");
  const template = document.getElementById("teamMemberTemplate");

  container.innerHTML = "";

  if (!teamState.members.length) {
    showEmpty(container, "emptyMembersTemplate");
    return;
  }

  teamState.members.forEach(member => {
    const node = template.content.cloneNode(true);

    node.querySelector(".member-name").textContent = member.name || member.email;
    node.querySelector(".member-meta").textContent =
      member.email || "No email";

    const badge = node.querySelector(".role-badge");
    badge.textContent = member.role;
    badge.classList.add(member.role);

    container.appendChild(node);
  });
}

// ============================================================
//  INVITES RENDER
// ============================================================

function renderInvites() {
  const container = document.getElementById("pendingInvitationsContainer");
  const template = document.getElementById("pendingInviteTemplate");

  container.innerHTML = "";

  if (!teamState.invites.length) {
    showEmpty(container, "emptyInvitesTemplate");
    return;
  }

  teamState.invites.forEach(invite => {
    const node = template.content.cloneNode(true);

    node.querySelector(".invite-email").textContent = invite.email;
    node.querySelector(".invite-meta").textContent =
      `Sent ${formatDate(invite.created_at)}`;

    const badge = node.querySelector(".role-badge");
    badge.textContent = invite.role;
    badge.classList.add(invite.role);

    // Actions
    node.querySelector(".copy-link-btn").onclick = () =>
      copyInviteLink(invite.token);

    node.querySelector(".resend-link-btn").onclick = () =>
      resendInvite(invite.id);

    node.querySelector(".revoke-link-btn").onclick = () =>
      revokeInvite(invite.id);

    container.appendChild(node);
  });
}

// ============================================================
//  INVITE ACTION
// ============================================================

async function sendInvitation() {
  const email = document.getElementById("inviteEmail").value;
  const role = document.getElementById("inviteRole").value;

  const btn = document.getElementById("inviteSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const { error } = await window.APP_CLIENT.rpc("create_team_invitation", {
      p_email: email,
      p_role: role
    });

    if (error) throw error;

    toast("Invitation sent successfully", "success");

    document.getElementById("inviteTeamForm").reset();
    await refreshTeamData();

  } catch (err) {
    console.error(err);
    toast("Failed to send invite", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Invitation";
  }
}

// ============================================================
//  QUICK ACTIONS
// ============================================================

async function copyJoinLink() {
  try {
    const link = `${window.location.origin}/join/`;
    await navigator.clipboard.writeText(link);
    toast("Join portal copied", "success");
  } catch {
    toast("Failed to copy link", "error");
  }
}

async function copyInviteLink(token) {
  const link = `${window.location.origin}/join/?token=${token}`;
  await navigator.clipboard.writeText(link);
  toast("Invite link copied", "success");
}

async function resendInvite(id) {
  try {
    await window.APP_CLIENT.rpc("resend_team_invitation", { p_id: id });
    toast("Invite resent", "success");
  } catch {
    toast("Failed to resend", "error");
  }
}

async function revokeInvite(id) {
  try {
    await window.APP_CLIENT.rpc("revoke_team_invitation", { p_id: id });
    toast("Invite revoked", "success");
    refreshTeamData();
  } catch {
    toast("Failed to revoke invite", "error");
  }
}

// ============================================================
//  INSIGHTS BILLBOARD ROTATION
// ============================================================

function startInsightRotation() {
  const el = document.getElementById("teamInsightMessage");
  if (!el) return;

  if (!teamState.insights.length) {
    el.textContent = "No team insights available.";
    return;
  }

  el.textContent = teamState.insights[0];

  setInterval(() => {
    teamState.insightIndex =
      (teamState.insightIndex + 1) % teamState.insights.length;

    el.style.opacity = 0;

    setTimeout(() => {
      el.textContent =
        teamState.insights[teamState.insightIndex];

      el.style.opacity = 1;
    }, 300);

  }, 4000);
}

// ============================================================
//  HELPERS
// ============================================================

function showEmpty(container, templateId) {
  const tpl = document.getElementById(templateId);
  container.appendChild(tpl.content.cloneNode(true));
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

// ============================================================
//  DASHBOARD BACK NAV
// ============================================================

function goDashboardHome() {
  if (typeof safeNavigate !== "undefined") {
    safeNavigate("/dashboard/");
  } else {
    window.location.href = "/dashboard/";
  }
}

function initInviteTeamModule() {
  // Kick off the module
  bindUIActions();
  loadTeamDashboard();
}
