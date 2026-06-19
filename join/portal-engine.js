// =============================================================================
// BIZIPLEX WORKSPACE PORTAL ENGINE
// =============================================================================

// Instantly establish the database context connection layer
const supabase = window.APP_CLIENT;

let currentToken = null;
let invitationData = null;

// Initialize on Document Load Event Handler Node
document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (!supabase) {
            throw new Error("The master client database instance is uninitialized. Verify global-config.js path mappings.");
        }

        const urlParams = new URLSearchParams(window.location.search);
        currentToken = urlParams.get('token');

        if (!currentToken) {
            // No token provided: default directly to team member login view
            switchView('viewLogin');
            return;
        }

        await executeTokenVerificationPipeline(currentToken);
    } catch (globalError) {
        console.error("Portal Execution Halted:", globalError);
        showModal('🚫', 'Portal Failure', `Initialization error: ${globalError.message}`);
    }
});

// =============================================================================
// TOKENS & TRANSACTION HANDSHAKES
// =============================================================================

async function executeTokenVerificationPipeline(token) {
    try {
        const cleanToken = token.trim();
        const { data, error } = await supabase.rpc('get_invitation_details', { p_token: cleanToken });
        
        if (error) throw error;
        
        if (data && data.success === false) {
            showModal('❌', 'Invitation Invalid', data.error || 'The invitation token has expired or is invalid.', () => {
                switchView('viewLogin');
            });
            return;
        }

        // Cache invitation state data context mapping
        invitationData = data;

        // Populate Brand Typography Assets onto target HTML Containers
        document.getElementById('workspaceName').innerText = data.store_name;
        
        if (data.logo_url && data.logo_url.trim() !== '') {
            document.getElementById('workspaceLogo').innerHTML = `<img src="${data.logo_url}" alt="Logo" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            document.getElementById('workspaceLogo').innerText = data.store_name.charAt(0).toUpperCase();
        }
        
        document.getElementById('workspaceBadge').style.visibility = 'visible';
        document.getElementById('signupEmail').value = data.email;
        
        // Push user safely into the onboarding subscription view
        switchView('viewSignUp');

    } catch (err) {
        console.error("Token Pipeline Crash:", err);
        showModal('🚫', 'Connection Interrupted', 'Could not establish security channel context: ' + (err.message || err.details || 'Unknown Network Intercept'));
    }
}

// Handle Form Account Registrations Handshake Node
async function handleTeamSignUp(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btnSignUpSubmit');
    const name = document.getElementById('signupName').value.trim();
    const password = document.getElementById('signupPassword').value;
    const email = invitationData.email;

    setLoadingState(submitBtn, true, 'Processing Access...');

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: { data: { display_name: name } }
        });

        if (authError) throw authError;

        const { data: rpcData, error: rpcError } = await supabase.rpc('accept_team_invitation', {
            p_token: currentToken,
            p_preferred_name: name
        });

        if (rpcError) throw rpcError;

        showModal('🎉', 'Welcome Aboard!', `Your team account is linked successfully. Let's head over to the command workspace dashboard.`, () => {
            evaluateSessionAndRoute();
        });

    } catch (err) {
        console.error("Sign up error:", err);
        showModal('🛑', 'Registration Denied', err.message || 'Error executing transactional authorization mapping.');
        setLoadingState(submitBtn, false, 'Accept & Activate');
    }
}

// Handle Traditional Password Authentication
async function handleTeamLogin(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btnLoginSubmit');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoadingState(submitBtn, true, 'Authorizing Entry...');

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        await evaluateSessionAndRoute();
    } catch (err) {
        console.error("Login verification crashed:", err);
        showModal('🔐', 'Access Disallowed', err.message || 'Invalid email or password match.');
        setLoadingState(submitBtn, false, 'Enter Workspace');
    }
}

// Password Reset Node Dispatcher
async function handleTeamForgot(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btnForgotSubmit');
    const email = document.getElementById('forgotEmail').value.trim();

    setLoadingState(submitBtn, true, 'Transmitting...');

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + getBasePath() + '/join/'
        });
        if (error) throw error;

        showModal('📩', 'Link Dispatched', 'Check your inbox for a password reset option link.', () => {
            switchView('viewLogin');
        });
    } catch (err) {
        showModal('⚠️', 'Transmission Erred', err.message);
    } finally {
        setLoadingState(submitBtn, false, 'Send Recovery Link');
    }
}

// Multi-Tenant Access Lifecycle Evaluator Guard
async function evaluateSessionAndRoute() {
    try {
        const { data: state, error } = await supabase.rpc('get_store_runtime_state');
        
        if (error) {
            showModal('🚧', 'Membership Unverified', 'Account verified, but no tenant workspace records match this identity.');
            return;
        }

        const s = Array.isArray(state) ? state[0] : state;
        
        if (!s || !s.store_id) {
            showModal('🕵️‍♂️', 'Sync Pending', 'Workspace details are pending synchronization. Try again shortly.');
            return;
        }

        if (s.is_suspended || !s.is_active) {
            showModal('🔒', 'Workspace Restricted', `Access locked: "${s.suspended_reason || 'Administrative Review'}"`);
            return;
        }

        if (s.subscription_status !== 'trial' && s.subscription_status !== 'active') {
            showModal('¼¼', 'Billing Notice', 'The billing lifecycle for this store requires layout maintenance.');
            return;
        }

        if (!s.onboarding_completed) {
            showModal('⏳', 'Setup Required', `The store owner must finish onboarding before team accounts can access the panel.`, () => {
                supabase.auth.signOut().then(() => location.reload());
            });
            return;
        }

        safeNavigate('dashboard/', true);

    } catch (err) {
        console.error("Routing calculation failure:", err);
        showModal('🚨', 'Routing Failure', 'Could not accurately verify tenant routing paths securely.');
    }
}

// =============================================================================
// DISPLAY INTERFACE MODAL WRAPPERS
// =============================================================================

function switchView(viewId) {
    document.querySelectorAll('.portal-view').forEach(view => view.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
}

function setLoadingState(buttonElement, isLoading, processText) {
    if (isLoading) {
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = `<div class="spinner" style="width:18px; height:18px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:8px;"></div> ${processText}`;
    } else {
        buttonElement.disabled = false;
        buttonElement.innerHTML = buttonElement.dataset.originalText || processText;
    }
}

let modalCallback = null;

function showModal(icon, title, message, callback = null) {
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalText').innerText = message;
    modalCallback = callback;
    document.getElementById('systemModal').classList.add('active');
}

function closeModal() {
    document.getElementById('systemModal').classList.remove('active');
    if (modalCallback) {
        const executeCall = modalCallback;
        modalCallback = null;
        executeCall();
    }
}
