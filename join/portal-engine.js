// =============================================================================
// BIZIPLEX WORKSPACE PORTAL ENGINE
// =============================================================================

// Safely pull the unified, authenticated client instance created by config.js
const supabase = window.APP_CLIENT || (window.supabase ? window.supabase.createClient(
    window.APP_CONFIG?.supabaseUrl || "https://ugffezktrojjhfbaxrrq.supabase.co",
    window.APP_CONFIG?.supabaseKey || ""
) : null);

// Global Operational State References
let currentToken = null;
let invitationData = null;

// On Initialization: Intercept Parameters from URL Routing Footprint
document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (!supabase) {
            throw new Error("Core database connector could not resolve. Ensure config.js is loaded prior to engine instantiation.");
        }

        const urlParams = new URLSearchParams(window.location.search);
        currentToken = urlParams.get('token');

        if (!currentToken) {
            // No explicit invitation mapping sequence provided: route straight to standard fallback login layout
            switchView('viewLogin');
            return;
        }

        await executeTokenVerificationPipeline(currentToken);
    } catch (globalError) {
        console.error("Portal Initialization Matrix Broken:", globalError);
        showModal('🚫', 'System Failure', `Initialization error: ${globalError.message}`);
    }
});

// =============================================================================
// CORE FUNCTIONS & RPC INTERCHANGES
// =============================================================================

async function executeTokenVerificationPipeline(token) {
    try {
        const { data, error } = await supabase.rpc('get_invitation_details', { p_token: token.trim() });
        
        if (error) throw error;
        
        if (data && data.success === false) {
            showModal('❌', 'Invitation Invalid', data.error || 'The onboarding verification token has decayed.', () => {
                switchView('viewLogin');
            });
            return;
        }

        // Cache state locally for execution phases
        invitationData = data;

        // Render Premium Brand Metadata inside Layout Containers
        document.getElementById('workspaceName').innerText = data.store_name;
        if (data.logo_url) {
            document.getElementById('workspaceLogo').innerHTML = `<img src="${data.logo_url}" alt="Logo" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            // Generate elegant initial character token dynamically
            document.getElementById('workspaceLogo').innerText = data.store_name.charAt(0).toUpperCase();
        }
        document.getElementById('workspaceBadge').style.visibility = 'visible';

        // Prefill lock down destination emails inside signup view form elements
        document.getElementById('signupEmail').value = data.email;
        
        // Advance portal state to Registration Phase
        switchView('viewSignUp');

    } catch (err) {
        console.error("Token verification crashed:", err);
        showModal('🚫', 'Portal Failure', 'Could not establish connection to BiziPlex security schemas: ' + (err.message || err.details));
    }
}

// Handle New User Account Registrations
async function handleTeamSignUp(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btnSignUpSubmit');
    const name = document.getElementById('signupName').value.trim();
    const password = document.getElementById('signupPassword').value;
    const email = invitationData.email;

    setLoadingState(submitBtn, true, 'Processing Access...');

    try {
        // Trigger User Creation Matrix in Supabase Auth Handler Node
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { display_name: name }
            }
        });

        if (authError) throw authError;

        // Execute Transactional RPC Database mapping handshake
        const { data: rpcData, error: rpcError } = await supabase.rpc('accept_team_invitation', {
            p_token: currentToken,
            p_preferred_name: name
        });

        if (rpcError) throw rpcError;

        showModal('🎉', 'Welcome Aboard!', `Successfully synchronized account mapping context. Let's redirect you to the main control panel.`, () => {
            evaluateSessionAndRoute();
        });

    } catch (err) {
        console.error("Registration sequence broken:", err);
        showModal('🛑', 'Registration Denied', err.message || 'Error occurred while creating workspace credentials.');
        setLoadingState(submitBtn, false, 'Accept & Activate');
    }
}

// Handle Returning Staff Authentication
async function handleTeamLogin(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btnLoginSubmit');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoadingState(submitBtn, true, 'Authorizing Entry...');

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Perform multi-tenant runtime access evaluations
        await evaluateSessionAndRoute();

    } catch (err) {
        console.error("Login verification crashed:", err);
        showModal('🔐', 'Access Disallowed', err.message || 'Invalid username or password configuration match.');
        setLoadingState(submitBtn, false, 'Enter Workspace');
    }
}

// Handle Password Reset Processing requests
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

        showModal('📩', 'Link Dispatched', 'Check your inbox for a link to update your secure access password.', () => {
            switchView('viewLogin');
        });

    } catch (err) {
        showModal('⚠️', 'Transmission Erred', err.message);
    } finally {
        setLoadingState(submitBtn, false, 'Send Recovery Link');
    }
}

// =============================================================================
// RUNTIME ROUTER MATRIX (Enterprise Node Access Guarding)
// =============================================================================

async function evaluateSessionAndRoute() {
    try {
        // Query the state engine for security validation
        const { data: state, error } = await supabase.rpc('get_store_runtime_state');
        
        if (error) {
            showModal('🚧', 'No Workspace Membership', 'You have successfully signed up, but you are not linked to an active workspace. Contact your administrator.');
            return;
        }

        const s = state[0] || state; // Account for array/object payload structures cleanly
        
        if (!s || !s.store_id) {
            showModal('🕵️‍♂️', 'Verification Pending', 'Account found, but workspace sync processing hasn\'t completed yet.');
            return;
        }

        // Evaluate core security layer triggers
        if (s.is_suspended || !s.is_active) {
            showModal('🔒', 'Workspace Locked', `Access has been restricted. Reason given: "${s.suspended_reason || 'Administrative Review'}"`);
            return;
        }

        if (s.subscription_status !== 'trial' && s.subscription_status !== 'active') {
            showModal('💳', 'Billing Verification Required', 'The billing lifecycle for this workspace requires attention. Please request that the store owner review their current plan.');
            return;
        }

        // Check internal activation progress
        if (!s.onboarding_completed) {
            showModal('⏳', 'Setup Incomplete', `The workspace owner has not finalized their initial business profile wizard setup. Access to the team interface will activate as soon as they complete onboarding.`, () => {
                supabase.auth.signOut().then(() => location.reload());
            });
            return;
        }

        // Route authenticated users to their dashboard workspace folder
        safeNavigate('dashboard/', true);

    } catch (err) {
        console.error("Routing resolution layer error:", err);
        showModal('🚨', 'Routing Conflict', 'Failed to safely resolve multi-tenant runtime routing boundaries.');
    }
}

// =============================================================================
// INTERFACE RENDERING UTILITIES
// =============================================================================

function switchView(viewId) {
    document.querySelectorAll('.portal-view').forEach(view => {
        view.classList.remove('active');
    });
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
        modalCallback = null; // Prevent loops
        executeCall();
    }
}
