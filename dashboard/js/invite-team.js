/**
 * ============================================================
 * BiziPlex Command Engine — Invite Team Module Script
 * ============================================================
 */

(function () {
  // Central module namespace
  const TeamModule = {
    state: {
      myRole: 'staff',
      currentCount: 0,
      maxStaff: 1,
      remainingSlots: 0,
      teamMembers: [],
      pendingInvitations: [],
      insightIndex: 0
    },

    // Cache DOM references inside the modular sandbox
    get refs() {
      return {
        insightMessage: document.getElementById("teamInsightMessage"),
        memberCount: document.getElementById("teamMemberCount"),
        pendingCount: document.getElementById("pendingInviteCount"),
        slotsCount: document.getElementById("availableSlotsCount"),
        planLimit: document.getElementById("planLimitCount"),
        capacityLabel: document.getElementById("capacityLabel"),
        capacityPercentage: document.getElementById("capacityPercentage"),
        capacityProgress: document.getElementById("capacityProgress"),
        form: document.getElementById("inviteTeamForm"),
        emailInput: document.getElementById("inviteEmail"),
        roleSelect: document.getElementById("inviteRole"),
        submitBtn: document.getElementById("inviteSubmitBtn"),
        membersContainer: document.getElementById("teamMembersContainer"),
        invitesContainer: document.getElementById("pendingInvitationsContainer"),
        copyPortalBtn: document.getElementById("copyJoinPortalBtn"),
        refreshBtn: document.getElementById("refreshTeamBtn")
      };
    },

    // Custom intelligence metrics logic for the billboard layout
    getInsights() {
      const remaining = this.state.remainingSlots;
      const total = this.state.currentCount + this.state.pendingInvitations.length;
      
      const lines = [
        `System Active: Operating at ${this.state.currentCount}/${this.state.maxStaff} workspace allocations.`,
        remaining === 0 
          ? "⚠️ Allocation full! Upgrade plan thresholds to include additional workflow staff members." 
          : `⚡ High performance enabled. You have ${remaining} open staff slots available for deployment.`,
        this.state.pendingInvitations.length > 0
          ? `📡 Pending verification: ${this.state.pendingInvitations.length} outstanding team invites awaiting onboarding.`
          : "📋 All workspace instances synced. No outstanding pending invitations listed."
      ];
      
      return lines;
    },

    /**
     * Initializes the entire module context
     */
    async init() {
      try {
        this.setupEventListeners();
        await this.fetchDashboardData();
        this.startIntelligenceBillboard();
      } catch (err) {
        console.error("[BiziTeamModule] Bootstrap sequence failure:", err);
        window.toast("Initialization error. Please reload dashboard.", "error");
      }
    },

    /**
     * Pulls the absolute unified system state down via RPC functions
     */
    async fetchDashboardData() {
      try {
        const { data, error } = await window.APP_CLIENT.rpc('get_team_dashboard');
        if (error) throw error;

        if (data) {
          this.state.myRole = data.my_role || 'staff';
          this.state.currentCount = data.current_staff_count || 0;
          this.state.maxStaff = data.max_staff || 1;
          this.state.remainingSlots = data.remaining_slots ?? 0;
          this.state.teamMembers = data.team_members || [];
          this.state.pendingInvitations = data.pending_invitations || [];

          this.renderUI();
        }
      } catch (err) {
        console.error("[BiziTeamModule] Fetch sequence error:", err);
        window.toast(err.message || "Failed to synchronise workspace data.", "error");
      }
    },

    /**
     * Computes permissions matrices and maps data values dynamically into HTML templates
     */
    renderUI() {
      const fx = this.refs;
      
      // Update basic dashboard stats
      if (fx.memberCount) fx.memberCount.textContent = this.state.currentCount;
      if (fx.pendingCount) fx.pendingCount.textContent = this.state.pendingInvitations.length;
      if (fx.slotsCount) fx.slotsCount.textContent = this.state.remainingSlots;
      if (fx.planLimit) fx.planLimit.textContent = this.state.maxStaff;

      // Plan Capacity Metrics calculations
      const allocatedTotal = this.state.currentCount;
      const percentage = Math.min(Math.round((allocatedTotal / this.state.maxStaff) * 100), 100);
      
      if (fx.capacityLabel) fx.capacityLabel.textContent = `Workspace Staff Members Usage (${allocatedTotal}/${this.state.maxStaff})`;
      if (fx.capacityPercentage) fx.capacityPercentage.textContent = `${percentage}%`;
      if (fx.capacityProgress) fx.capacityProgress.style.width = `${percentage}%`;

      // Enforce operational restrictions down to standard Staff/Admin limits
      const hasPermission = ['owner', 'super_admin'].includes(this.state.myRole);
      if (fx.form) {
        const inputs = fx.form.querySelectorAll('input, select, button');
        inputs.forEach(el => {
          if (!hasPermission) el.setAttribute('disabled', 'true');
        });
        if (!hasPermission && fx.submitBtn) {
          fx.submitBtn.textContent = "Owner or Super Admin Clearance Required";
        }
      }

      this.renderTeamMembers();
      this.renderPendingInvitations();
    },

    /**
     * Maps database entries directly using <template> fragments safely
     */
    renderTeamMembers() {
      const container = this.refs.membersContainer;
      if (!container) return;

      container.innerHTML = "";
      if (this.state.teamMembers.length === 0) {
        const template = document.getElementById("emptyMembersTemplate");
        container.appendChild(template.content.cloneNode(true));
        return;
      }

      const template = document.getElementById("teamMemberTemplate");
      this.state.teamMembers.forEach(member => {
        const clone = template.content.cloneNode(true);
        
        clone.querySelector(".member-name").textContent = member.member_name || "Team Member";
        
        const dateStr = member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'N/A';
        clone.querySelector(".member-meta").textContent = `Assigned context node · Joined ${dateStr}`;
        
        const badge = clone.querySelector(".role-badge");
        badge.textContent = member.role.replace('_', ' ');
        badge.className = `role-badge ${member.role}`;

        container.appendChild(clone);
      });
    },

    /**
     * Loops across unverified invitations tokens and dynamically sets button hooks
     */
    renderPendingInvitations() {
      const container = this.refs.invitesContainer;
      if (!container) return;

      container.innerHTML = "";
      if (this.state.pendingInvitations.length === 0) {
        const template = document.getElementById("emptyInvitesTemplate");
        container.appendChild(template.content.cloneNode(true));
        return;
      }

      const template = document.getElementById("pendingInviteTemplate");
      const hasPermission = ['owner', 'super_admin'].includes(this.state.myRole);

      this.state.pendingInvitations.forEach(invite => {
        const clone = template.content.cloneNode(true);
        
        clone.querySelector(".invite-email").textContent = invite.email;
        
        const expireStr = invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : 'N/A';
        clone.querySelector(".invite-meta").textContent = `Token active · Expires: ${expireStr}`;
        
        const badge = clone.querySelector(".role-badge");
        badge.textContent = invite.role.replace('_', ' ');
        badge.className = `role-badge ${invite.role}`;

        // Build premium universal domain onboarding link architecture
        const secureLink = `https://biziplex.com/join/?token=${invite.invite_token}`;

        // Action binding routines
        const copyBtn = clone.querySelector(".copy-link-btn");
        copyBtn.addEventListener("click", () => this.copyToClipboard(secureLink, "Invitation link copied to clipboard!"));

        const resendBtn = clone.querySelector(".resend-link-btn");
        const revokeBtn = clone.querySelector(".revoke-link-btn");

        if (!hasPermission) {
          resendBtn.remove();
          revokeBtn.remove();
        } else {
          resendBtn.addEventListener("click", () => this.handleResend(invite.id));
          revokeBtn.addEventListener("click", () => this.handleRevoke(invite.id));
        }

        container.appendChild(clone);
      });
    },

    /**
     * Dispatches team creation tokens across network functions
     */
    async handleInviteSubmit(e) {
      e.preventDefault();
      const fx = this.refs;
      if (!fx.emailInput || !fx.roleSelect) return;

      const email = fx.emailInput.value.trim();
      const role = fx.roleSelect.value;

      if (this.state.remainingSlots <= 0) {
        window.toast("Plan quota reached! Upgrade tier to scale team capacities.", "error");
        return;
      }

      try {
        if (fx.submitBtn) {
          fx.submitBtn.disabled = true;
          fx.submitBtn.textContent = "Generating Cryptographic Token...";
        }

        const { data, error } = await window.APP_CLIENT.rpc('create_team_invitation', {
          p_email: email,
          p_role: role
        });

        // Note: Accommodating any RPC message errors directly returned as structured JSON responses
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.message || "Failed request validation.");

        window.toast(`Invitation successfully staged for ${email}!`, "success");
        fx.form.reset();
        
        await this.fetchDashboardData();

        // Autocopy the generated portal node to secure quick sharing via WhatsApp
        if (data && data.token) {
          const quickUrl = `https://biziplex.com/join/?token=${data.token}`;
          await this.copyToClipboard(quickUrl, "Invite link automatically copied to clipboard for WhatsApp routing!");
        }

      } catch (err) {
        console.error("[BiziTeamModule] Creation handler rejection:", err);
        window.toast(err.message || "Inquiries tracking error or active constraints conflict.", "error");
      } finally {
        if (fx.submitBtn) {
          fx.submitBtn.disabled = false;
          fx.submitBtn.textContent = "Send Invitation";
        }
      }
    },

    /**
     * Requests lifecycle extensions from database timestamps
     */
    async handleResend(inviteId) {
      try {
        const { data, error } = await window.APP_CLIENT.rpc('resend_team_invitation', {
          p_invitation_id: inviteId
        });
        if (error) throw error;
        
        window.toast("Token expiration frame extended for an additional 7 days.", "success");
        await this.fetchDashboardData();
      } catch (err) {
        console.error("[BiziTeamModule] Resend routine fault:", err);
        window.toast(err.message || "Failed updating expiration parameters.", "error");
      }
    },

    /**
     * Terminate active tokens directly across validation vectors
     */
    async handleRevoke(inviteId) {
      if (!confirm("Are you sure you want to revoke this pending invitation? Access logic will instantly break.")) return;
      try {
        const { data, error } = await window.APP_CLIENT.rpc('revoke_team_invitation', {
          p_invitation_id: inviteId
        });
        if (error) throw error;

        window.toast("Invitation link has been explicitly revoked.", "success");
        await this.fetchDashboardData();
      } catch (err) {
        console.error("[BiziTeamModule] Revocation route fault:", err);
        window.toast(err.message || "Failed tracking cancellation adjustments.", "error");
      }
    },

    /**
     * Global dashboard link copies helper
     */
    async copyToClipboard(text, trackingMsg) {
      try {
        await navigator.clipboard.writeText(text);
        window.toast(trackingMsg, "success");
      } catch (err) {
        // Fallback approach strategy for limited permissions display layers
        const tempArea = document.createElement("textarea");
        tempArea.value = text;
        document.body.appendChild(tempArea);
        tempArea.select();
        document.execCommand("copy");
        document.body.removeChild(tempArea);
        window.toast(trackingMsg, "success");
      }
    },

    /**
     * Manages rotation engine processes for the hardware data banner
     */
    startIntelligenceBillboard() {
      if (this.billboardInterval) clearInterval(this.billboardInterval);
      
      const refreshBillboardText = () => {
        const fx = this.refs;
        if (!fx.insightMessage) return;
        
        const lines = this.getInsights();
        fx.insightMessage.style.opacity = 0;
        
        setTimeout(() => {
          this.state.insightIndex = (this.state.insightIndex + 1) % lines.length;
          fx.insightMessage.textContent = lines[this.state.insightIndex];
          fx.insightMessage.style.transition = "opacity 0.25s ease-in-out";
          fx.insightMessage.style.opacity = 1;
        }, 250);
      };

      // Run baseline initial update iteration step
      const initialLines = this.getInsights();
      if (this.refs.insightMessage && initialLines.length > 0) {
        this.refs.insightMessage.textContent = initialLines[0];
      }

      this.billboardInterval = setInterval(refreshBillboardText, 6000);
    },

    /**
     * Sets up DOM structural node interactions
     */
    setupEventListeners() {
      const fx = this.refs;

      if (fx.form) {
        fx.form.removeEventListener("submit", this.formSubmitRef);
        this.formSubmitRef = (e) => this.handleInviteSubmit(e);
        fx.form.addEventListener("submit", this.formSubmitRef);
      }

      if (fx.copyPortalBtn) {
        fx.copyPortalBtn.onclick = () => this.copyToClipboard("https://biziplex.com/join/", "Join Portal baseline URL copied!");
      }

      if (fx.refreshBtn) {
        fx.refreshBtn.onclick = async () => {
          fx.refreshBtn.style.transform = "rotate(360deg)";
          fx.refreshBtn.style.transition = "transform 0.5s ease";
          await this.fetchDashboardData();
          window.toast("Workspace metrics successfully synchronized.", "success");
          setTimeout(() => { fx.refreshBtn.style.transform = "none"; fx.refreshBtn.style.transition = "none"; }, 500);
        };
      }
    }
  };

  /**
   * Safe initialization routine that maps across layout engine behaviors 
   * defined in your `js/sidebar.js` template structure loaders.
   */
  window.initInviteTeamModule = function () {
    console.log("[BiziPlex Core] Loading Invite Team workspace contexts...");
    TeamModule.init();
  };

  // Auto-run hook if script lands into an already compiled context window instance
  if (document.getElementById("inviteTeamForm")) {
    window.initInviteTeamModule();
  }
})();
