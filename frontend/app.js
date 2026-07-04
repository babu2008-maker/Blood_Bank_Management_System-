// Blood Donate - Frontend App Logic

// Global state
const state = {
    token: localStorage.getItem('blood_donate_token') || '',
    user: null,
    activeView: 'dashboard',
    donors: [],
    inventory: [],
    requests: [],
    auditLogs: [],
    reports: null,
    reportsTab: 'donations',
    activeDonor: null,
    activeRequest: null
};

// API Base URL
const API_BASE = window.location.origin;

// Inject role-based CSS rules dynamically
const style = document.createElement('style');
style.innerHTML = `
    .hide-role { display: none !important; }
`;
document.head.appendChild(style);

// ==========================================
// API CLIENT UTILITY
// ==========================================
async function apiCall(endpoint, options = {}) {
    const headers = {};
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    if (options.body && !(options.body instanceof URLSearchParams)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    
    options.headers = {
        ...headers,
        ...options.headers
    };
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (response.status === 401) {
            // Unauthorized - logout
            logout();
            throw new Error("Session expired. Please log in again.");
        }
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'An error occurred');
        }
        return data;
    } catch (err) {
        console.error(`API Error on ${endpoint}:`, err);
        throw err;
    }
}

// ==========================================
// INITIALIZATION & AUTH
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

// Public quick-request mode flag
let publicRequestMode = false;
// Donor-mode flag: when true, after login show donors and requests
state.donorLoginMode = false;

async function initApp() {
    // Set current date in header
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('header-date').innerText = new Date().toLocaleDateString('en-US', options);

    if (state.token) {
        try {
            state.user = await apiCall('/api/auth/me');
            showAppShell();
        } catch (err) {
            localStorage.removeItem('blood_donate_token');
            state.token = '';
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    document.getElementById('login-container').classList.remove('hide');
    document.getElementById('app-container').classList.add('hide');
    // Show chooser and hide the login form initially
    const chooser = document.getElementById('start-chooser');
    if (chooser) chooser.classList.remove('hide');
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.classList.add('hide');
    const publicHint = document.getElementById('public-donor-hint');
    if (publicHint) publicHint.classList.add('hide');
    const signupToggle = document.getElementById('signup-toggle-wrapper');
    if (signupToggle) signupToggle.classList.add('hide');
    const signupForm = document.getElementById('signup-form');
    if (signupForm) signupForm.classList.add('hide');
    const loginCard = document.querySelector('.login-card');
    if (loginCard) loginCard.classList.remove('visible');
    state.donorLoginMode = false;
}

function enterLoginMode(isDonor = false) {
    const chooser = document.getElementById('start-chooser');
    if (chooser) chooser.classList.add('hide');
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.classList.remove('hide');
    const loginCard = document.querySelector('.login-card');
    if (loginCard) loginCard.classList.add('visible');
    const signupToggle = document.getElementById('signup-toggle-wrapper');
    if (signupToggle) {
        if (isDonor) signupToggle.classList.remove('hide');
        else signupToggle.classList.add('hide');
    }
    const signupForm = document.getElementById('signup-form');
    if (signupForm) signupForm.classList.add('hide');
    state.donorLoginMode = isDonor;
    publicRequestMode = false;
}

function showAppShell() {
    document.getElementById('login-container').classList.add('hide');
    document.getElementById('app-container').classList.remove('hide');
    
    // Set profile info
    document.getElementById('nav-user-fullname').innerText = state.user.full_name;
    const normalizedRole = state.user.role ? state.user.role.toLowerCase() : '';
    document.getElementById('nav-user-role').innerText = normalizedRole;
    
    // Apply Role-based Access Control (RBAC) in UI
    applyRolePermissions(normalizedRole);
    
    // Switch to default view or accessible view
    let defaultView = 'dashboard';
    if (normalizedRole === 'staff') {
        defaultView = 'donors'; // Staff users land in the donor hub
    }
    if (normalizedRole === 'hospital') {
        defaultView = 'requests'; // Hospitals default to requests view
    }
    if (normalizedRole === 'inventory') {
        defaultView = 'inventory'; // inventory-only users default to inventory view
    }
    if (normalizedRole === 'donor') {
        defaultView = 'requests'; // Donors should land in blood requests only
    }
    // Donor-mode (explicit): override role defaults and show requests view
    if (state.donorLoginMode) {
        defaultView = 'requests';
    }
    switchView(defaultView);

    // If we logged in via donor-mode, ensure requests link is visible
    if (state.donorLoginMode) {
        const requestsLi = document.querySelector('[data-view="requests"]');
        if (requestsLi) requestsLi.classList.remove('hide-role');
        // Reset donor mode after applying view
        state.donorLoginMode = false;
    }
}

function applyRolePermissions(role) {
    // Hide all elements with role classes
    document.querySelectorAll('.role-admin, .role-staff, .role-manager, .role-hospital').forEach(el => {
        el.classList.add('hide-role');
    });
    
    // Show elements that match current user's role
    document.querySelectorAll(`.role-${role}`).forEach(el => {
        el.classList.remove('hide-role');
    });

    // Special-case: inventory-only role
    if (role === 'inventory') {
        // Allow elements explicitly marked for inventory viewers
        document.querySelectorAll('.role-inventory').forEach(el => el.classList.remove('hide-role'));
        // Ensure donor-specific actions remain hidden
        document.querySelectorAll('.role-staff, .role-admin, .role-manager, .role-hospital').forEach(el => {
            if (!el.classList.contains('role-inventory')) el.classList.add('hide-role');
        });
    }

    // Donor role should only see blood requests
    if (role === 'donor') {
        document.querySelectorAll('.sidebar-nav li').forEach(li => {
            if (li.getAttribute('data-view') !== 'requests') {
                li.classList.add('hide-role');
            }
        });
        const donorsSection = document.getElementById('view-donors');
        if (donorsSection) donorsSection.classList.add('hide');
        const openRegisterDonorBtn = document.getElementById('btn-open-register-donor');
        if (openRegisterDonorBtn) openRegisterDonorBtn.classList.add('hide-role');
        const donorSearch = document.getElementById('donor-search-input');
        if (donorSearch) donorSearch.closest('.action-bar')?.classList.add('hide-role');
    }
    
    // Admin has access to everything
    if (role === 'admin') {
        document.querySelectorAll('.role-staff, .role-manager, .role-hospital').forEach(el => {
            el.classList.remove('hide-role');
        });
    }
    
    // Staff also has access to hospital request creation
    if (role === 'staff') {
        document.querySelectorAll('.role-hospital').forEach(el => {
            el.classList.remove('hide-role');
        });
    }
}

function logout() {
    localStorage.removeItem('blood_donate_token');
    state.token = '';
    state.user = null;
    showLoginScreen();
}


// ==========================================
// VIEW SWITCHING / ROUTING
// ==========================================
function switchView(viewId) {
    // Prevent donor users from switching to anything except requests
    const normalizedRole = state.user?.role ? state.user.role.toLowerCase() : '';
    if (normalizedRole === 'donor' && viewId !== 'requests') {
        viewId = 'requests';
    }

    state.activeView = viewId;
    
    // Update active class in sidebar nav
    document.querySelectorAll('.sidebar-nav li').forEach(li => {
        if (li.getAttribute('data-view') === viewId) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });
    
    // Update Header Title
    const titles = {
        'dashboard': 'Overview',
        'donors': 'Donor Hub',
        'inventory': 'Stock Management',
        'requests': 'Blood Requests',
        'reports': 'Operations',
        'audit-logs': 'Audit Trail'
    };
    document.getElementById('current-page-title').innerText = titles[viewId] || 'Blood Donate';
    
    // Hide all view sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hide');
    });
    
    // Show active section
    const activeSection = document.getElementById(`view-${viewId}`);
    if (activeSection) {
        activeSection.classList.remove('hide');
    }
    
    // Fetch and populate view-specific data
    loadViewData(viewId);
}

function loadViewData(viewId) {
    switch (viewId) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'donors':
            loadDonorsData();
            break;
        case 'inventory':
            loadInventoryData();
            break;
        case 'requests':
            loadRequestsData();
            break;
        case 'reports':
            loadReportsData();
            break;
        case 'audit-logs':
            loadAuditLogsData();
            break;
    }
}


// ==========================================
// EVENT LISTENERS BINDING
// ==========================================
function setupEventListeners() {
    // Login Form
    document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
    
    // Sidebar Navigation
    document.querySelectorAll('.sidebar-nav li').forEach(li => {
        li.addEventListener('click', (e) => {
            e.preventDefault();
            const view = li.getAttribute('data-view');
            if (view) switchView(view);
        });
    });
    
    // Logout Button
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Modal closing triggers
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    
    // Donor search
    document.getElementById('donor-search-input').addEventListener('input', debounce((e) => {
        loadDonorsData(e.target.value);
    }, 300));
    
    // Open Register Donor Modal
    document.getElementById('btn-open-register-donor').addEventListener('click', () => {
        clearRegisterDonorMessage();
        openModal('modal-register-donor');
    });

    // Start chooser buttons (Staff / Donor)
    const startStaff = document.getElementById('start-staff');
    const startDonor = document.getElementById('start-donor');
    if (startStaff) startStaff.addEventListener('click', () => {
        enterLoginMode(false);
    });
    if (startDonor) startDonor.addEventListener('click', () => {
        enterLoginMode(true);
    });

    // Signup form toggles
    const showSignup = document.getElementById('btn-show-signup');
    const signupForm = document.getElementById('signup-form');
    const cancelSignup = document.getElementById('btn-cancel-signup');
    const submitSignup = document.getElementById('btn-submit-signup');
    if (showSignup) showSignup.addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hide');
        signupForm.classList.remove('hide');
    });
    if (cancelSignup) cancelSignup.addEventListener('click', () => {
        signupForm.classList.add('hide');
        document.getElementById('login-form').classList.remove('hide');
        const signupToggle = document.getElementById('signup-toggle-wrapper');
        if (state.donorLoginMode && signupToggle) {
            signupToggle.classList.remove('hide');
        } else if (signupToggle) {
            signupToggle.classList.add('hide');
        }
    });
    if (submitSignup) submitSignup.addEventListener('click', async () => {
        const full_name = document.getElementById('signup-fullname').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const username = document.getElementById('signup-username').value.trim();
        const password = document.getElementById('signup-password').value;
        if (!full_name || !email || !username || !password) {
            showToast('Please fill all signup fields.', 'error');
            return;
        }
        try {
            const resp = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, email, full_name })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Failed to create account');
            showToast('Account created. Please sign in.', 'success');
            signupForm.classList.add('hide');
            document.getElementById('login-form').classList.remove('hide');
        } catch (err) {
            showToast(err.message || 'Signup error', 'error');
        }
    });
    
    // Submit Register Donor Form
    const registerDonorForm = document.getElementById('register-donor-form');
    if (registerDonorForm) {
        registerDonorForm.addEventListener('submit', handleRegisterDonor);
    }
    
    // Record Donation Button inside Donor Modal
    document.getElementById('btn-record-new-donation').addEventListener('click', handleRecordDonation);
    
    // Inventory filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const bgGroup = tab.getAttribute('data-group');
            loadInventoryData(bgGroup === 'ALL' ? null : bgGroup);
        });
    });
    
    // Open Check In Blood Unit Modal
    document.getElementById('btn-open-check-in-unit').addEventListener('click', () => {
        // Set default values
        document.getElementById('stock-barcode').value = '';
        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 42); // 42 days shelf life
        document.getElementById('stock-expiry').value = defaultExpiry.toISOString().split('T')[0];
        openModal('modal-check-in-unit');
    });
    
    // Generate barcode button inside inventory check in modal
    document.getElementById('btn-generate-barcode').addEventListener('click', () => {
        const bg = document.getElementById('stock-blood-group').value || 'GEN';
        const formattedBg = bg.replace('+', 'POS').replace('-', 'NEG');
        const barcode = `BAR-${formattedBg}-${Math.floor(100000 + Math.random() * 900000)}`;
        document.getElementById('stock-barcode').value = barcode;
    });
    
    // Submit Check In Blood Unit Form
    document.getElementById('check-in-unit-form').addEventListener('submit', handleCheckInStock);
    
    // Request status filters
    document.querySelectorAll('.filter-status-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const status = tab.getAttribute('data-status');
            loadRequestsData(status === 'ALL' ? null : status);
        });
    });
    
    // Open Submit Request Modal
    document.getElementById('btn-open-create-request').addEventListener('click', () => {
        const form = document.getElementById('create-request-form');
        form.reset();
        
        // Auto fill hospital name if current user is hospital
        if (state.user.role === 'hospital' && state.user.hospital_name) {
            const hInput = document.getElementById('req-hospital-name');
            hInput.value = state.user.hospital_name;
            hInput.setAttribute('disabled', 'true');
        } else {
            document.getElementById('req-hospital-name').removeAttribute('disabled');
        }
        openModal('modal-create-request');
    });
    
    // Submit Blood Request Form
    document.getElementById('create-request-form').addEventListener('submit', handleCreateRequest);
    
    // Submit Manage Request Status Form
    document.getElementById('manage-request-form').addEventListener('submit', handleUpdateStatusSubmit);
    document.getElementById('manage-req-status').addEventListener('change', handleRequestActionChange);
    
    // Reports sub-tabs
    document.getElementById('btn-show-donations-report').addEventListener('click', () => {
        document.getElementById('btn-show-donations-report').classList.add('active');
        document.getElementById('btn-show-requests-report').classList.remove('active');
        state.reportsTab = 'donations';
        renderReportsTable();
    });
    
    document.getElementById('btn-show-requests-report').addEventListener('click', () => {
        document.getElementById('btn-show-requests-report').classList.add('active');
        document.getElementById('btn-show-donations-report').classList.remove('active');
        state.reportsTab = 'requests';
        renderReportsTable();
    });
    
    // Export CSV
    document.getElementById('btn-export-csv').addEventListener('click', handleExportCSV);
}

// Enhance modal selects with a custom dropdown to ensure dark-themed option lists
function enhanceModalSelects() {
    const selects = document.querySelectorAll('.modal select');
    selects.forEach(select => {
        if (select.dataset.customized === 'true') return;
        select.dataset.customized = 'true';

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        // Trigger element
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.textContent = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : 'Select';
        const arrow = document.createElement('span');
        arrow.innerHTML = '<i class="fa-solid fa-caret-down"></i>';
        trigger.appendChild(labelSpan);
        trigger.appendChild(arrow);

        // Options container
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-options';

        // Build options
        Array.from(select.options).forEach(opt => {
            const o = document.createElement('div');
            o.className = 'custom-option';
            o.setAttribute('data-value', opt.value);
            o.textContent = opt.text;
            if (opt.disabled) o.setAttribute('aria-disabled', 'true');
            if (opt.selected) o.setAttribute('aria-selected', 'true');
            o.addEventListener('click', () => {
                // Update original select
                select.value = opt.value;
                // Update trigger label
                labelSpan.textContent = opt.text;
                // Close
                wrapper.classList.remove('open');
                // Update aria-selected
                optionsContainer.querySelectorAll('.custom-option').forEach(c => c.setAttribute('aria-selected', 'false'));
                o.setAttribute('aria-selected', 'true');
                // Fire change event on original select
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            optionsContainer.appendChild(o);
        });

        // Assemble
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsContainer);

        // Insert wrapper before select and hide original
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        // Toggle open
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other open selects
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => { if (w !== wrapper) w.classList.remove('open'); });
            wrapper.classList.toggle('open');
        });
    });

    // Close on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
    });
}

// Run enhancement after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    enhanceModalSelects();
});


// ==========================================
// MODAL CONTROLS
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hide');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hide'));
}


// ==========================================
// SUBMISSIONS HANDLERS
// ==========================================

async function handleLoginSubmit(e) {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const errDiv = document.getElementById('login-error');
    errDiv.classList.add('hide');
    
    const params = new URLSearchParams();
    params.append('username', u);
    params.append('password', p);
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            body: params
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Incorrect credentials');
        }
        
        state.token = data.access_token;
        localStorage.setItem('blood_donate_token', data.access_token);
        state.user = {
            username: data.username,
            role: data.role,
            full_name: data.full_name
        };
        
        showAppShell();
        document.getElementById('login-form').reset();
    } catch (err) {
        document.getElementById('login-error-text').innerText = err.message;
        errDiv.classList.remove('hide');
    }
}

async function handleRegisterDonor(e) {
    e.preventDefault();
    clearRegisterDonorMessage();

    const form = document.getElementById('register-donor-form');
    const fields = {
        name: document.getElementById('donor-name'),
        age: document.getElementById('donor-age'),
        gender: document.getElementById('donor-gender'),
        blood_group: document.getElementById('donor-blood-group'),
        contact_number: document.getElementById('donor-phone'),
        email: document.getElementById('donor-email')
    };

    const errors = [];
    Object.entries(fields).forEach(([key, field]) => {
        if (!field.value || field.value.trim() === '') {
            errors.push(`Please enter a valid ${field.previousElementSibling?.innerText || key.replace('_', ' ')}.`);
        }
    });

    const ageValue = parseInt(fields.age.value, 10);
    if (Number.isNaN(ageValue) || ageValue < 18 || ageValue > 100) {
        errors.push('Age must be a number between 18 and 100.');
    }

    if (errors.length > 0) {
        showRegisterDonorMessage('error', errors.join(' '));
        return;
    }

    const payload = {
        name: fields.name.value.trim(),
        age: ageValue,
        gender: fields.gender.value,
        blood_group: fields.blood_group.value,
        contact_number: fields.contact_number.value.trim(),
        email: fields.email.value.trim(),
        address: document.getElementById('donor-address').value.trim(),
        eligibility_status: document.getElementById('donor-eligible').checked,
        eligibility_notes: document.getElementById('donor-eligibility-notes').value.trim()
    };

    try {
        await apiCall('/api/donors', {
            method: 'POST',
            body: payload
        });
        showRegisterDonorMessage('success', 'Donor registered successfully.');
        showToast('Donor registered successfully.', 'success');
        form.reset();
        loadDonorsData();
        setTimeout(() => {
            closeModal();
            clearRegisterDonorMessage();
        }, 1200);
    } catch (err) {
        const errorMessage = `Error registering donor: ${err.message}`;
        showRegisterDonorMessage('error', errorMessage);
        showToast(errorMessage, 'error');
    }
}

function showRegisterDonorMessage(type, message) {
    const messageEl = document.getElementById('register-donor-message');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.className = `form-message ${type === 'success' ? 'success-alert' : 'error-alert'}`;
}

function clearRegisterDonorMessage() {
    const messageEl = document.getElementById('register-donor-message');
    if (!messageEl) return;
    messageEl.textContent = '';
    messageEl.className = 'form-message hide';
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.right = '24px';
        container.style.bottom = '24px';
        container.style.zIndex = '2000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    toast.style.padding = '14px 18px';
    toast.style.borderRadius = '14px';
    toast.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.18)';
    toast.style.fontSize = '0.95rem';
    toast.style.maxWidth = '320px';
    toast.style.color = '#fff';
    toast.style.backgroundColor = type === 'success' ? 'rgba(46, 204, 113, 0.95)' : 'rgba(239, 45, 86, 0.95)';
    toast.style.cursor = 'default';
    toast.style.pointerEvents = 'auto';

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.addEventListener('transitionend', () => {
            toast.remove();
            if (container.childElementCount === 0) {
                container.remove();
            }
        }, { once: true });
    }, 3200);
}

async function handleRecordDonation() {
    if (!state.activeDonor) return;
    const vol = parseInt(document.getElementById('donation-volume').value) || 350;
    
    try {
        await apiCall(`/api/donors/${state.activeDonor.id}/donations?quantity_ml=${vol}`, {
            method: 'POST'
        });
        
        // Refresh details modal contents
        loadDonorDetails(state.activeDonor.id);
        
        // If the donors view is active, refresh the main table in background
        if (state.activeView === 'donors') {
            loadDonorsData();
        }
    } catch (err) {
        alert(`Error recording donation: ${err.message}`);
    }
}

async function handleCheckInStock(e) {
    e.preventDefault();
    const payload = {
        blood_group: document.getElementById('stock-blood-group').value,
        quantity_ml: parseInt(document.getElementById('stock-volume').value),
        unit_barcode: document.getElementById('stock-barcode').value,
        expiry_date: new Date(document.getElementById('stock-expiry').value).toISOString()
    };
    
    try {
        await apiCall('/api/inventory/add', {
            method: 'POST',
            body: payload
        });
        closeModal();
        document.getElementById('check-in-unit-form').reset();
        loadInventoryData();
    } catch (err) {
        alert(`Error checking in stock: ${err.message}`);
    }
}

async function handleCreateRequest(e) {
    e.preventDefault();
    const payload = {
        patient_name: document.getElementById('req-patient-name').value,
        requesting_hospital: document.getElementById('req-hospital-name').value,
        blood_group: document.getElementById('req-blood-group').value,
        quantity_units: parseInt(document.getElementById('req-qty').value),
        urgency: document.getElementById('req-urgency').value
    };
    
    try {
        if (publicRequestMode || !state.token) {
            // Submit to public unauthenticated endpoint
            const resp = await fetch(`${API_BASE}/api/public/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Failed to submit public request');
        } else {
            await apiCall('/api/requests', {
                method: 'POST',
                body: payload
            });
        }
        closeModal();
        document.getElementById('create-request-form').reset();
        if (state.token) {
            loadRequestsData();
        } else {
            showToast('Your request was submitted. We will contact you if available.', 'success');
        }
        publicRequestMode = false;
    } catch (err) {
        alert(`Error submitting request: ${err.message}`);
    }
}

async function handleRequestActionChange(e) {
    const action = e.target.value;
    const alertDiv = document.getElementById('fulfillment-stock-status');
    alertDiv.classList.add('hide');
    
    if (action === 'Fulfilled' && state.activeRequest) {
        // Query dashboard summary to check stock availability
        try {
            const summary = await apiCall('/api/dashboard/summary');
            const grp = summary.stock_by_group.find(s => s.blood_group === state.activeRequest.blood_group);
            const unitsAvailable = grp ? grp.available_units : 0;
            const unitsNeeded = state.activeRequest.quantity_units;
            
            if (unitsAvailable < unitsNeeded) {
                alertDiv.className = 'fulfillment-stock-alert error';
                alertDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Insufficient Stock!</strong> Only ${unitsAvailable} unit(s) of ${state.activeRequest.blood_group} available. Fulfilling this request will fail.`;
            } else {
                alertDiv.className = 'fulfillment-stock-alert success';
                alertDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Stock Available!</strong> ${unitsAvailable} unit(s) of ${state.activeRequest.blood_group} in stock. FIFO units will be dispatched.`;
            }
            alertDiv.classList.remove('hide');
        } catch (err) {
            console.error("Error fetching summary during action update:", err);
        }
    }
}

async function handleUpdateStatusSubmit(e) {
    e.preventDefault();
    if (!state.activeRequest) return;
    
    const payload = {
        status: document.getElementById('manage-req-status').value,
        status_notes: document.getElementById('manage-req-notes').value
    };
    
    try {
        await apiCall(`/api/requests/${state.activeRequest.id}/status`, {
            method: 'PUT',
            body: payload
        });
        closeModal();
        document.getElementById('manage-request-form').reset();
        loadRequestsData();
    } catch (err) {
        alert(`Fulfillment Error: ${err.message}`);
    }
}


// ==========================================
// DATA FETCHERS & RENDERING
// ==========================================

// --- DASHBOARD ---
async function loadDashboardData() {
    try {
        const summary = await apiCall('/api/dashboard/summary');
        
        // Set stats cards
        document.getElementById('stat-available-units').innerHTML = `${summary.total_stock_units} <span class="unit">units</span>`;
        document.getElementById('stat-available-ml').innerText = `${summary.total_stock_ml.toLocaleString()} ml total`;
        document.getElementById('stat-total-donors').innerText = summary.total_donors;
        document.getElementById('stat-active-donors').innerText = `${summary.active_donors} active & eligible`;
        document.getElementById('stat-pending-requests').innerText = summary.pending_requests_count;
        
        const alertUnits = summary.expired_units_count + summary.near_expiry_units_count;
        document.getElementById('stat-alert-units').innerText = alertUnits;
        document.getElementById('stat-expired-units').innerText = `${summary.expired_units_count} expired, ${summary.near_expiry_units_count} near-expiry`;
        
        // Show banner if total available units of O- or O+ are less than 2
        const lowStockO = summary.stock_by_group.find(s => s.blood_group === 'O-' || s.blood_group === 'O+');
        let showLowBanner = false;
        summary.stock_by_group.forEach(s => {
            if (s.available_units === 0) showLowBanner = true;
        });
        
        const banner = document.getElementById('critical-alert-banner');
        if (showLowBanner) {
            banner.classList.remove('hide');
        } else {
            banner.classList.add('hide');
        }
        
        // Render Stock Level Bar Chart
        renderBloodChart(summary.stock_by_group);
        
        // Load detailed alerts lists
        loadDashboardAlerts();
    } catch (err) {
        console.error("Error loading dashboard metrics:", err);
    }
}

function renderBloodChart(groups) {
    const container = document.getElementById('blood-groups-chart');
    container.innerHTML = '';
    
    // Find max value to calibrate bar scaling
    const maxVal = Math.max(...groups.map(g => g.available_units), 5); // minimum height limit is 5 units to avoid division by zero
    
    groups.forEach(g => {
        const pct = (g.available_units / maxVal) * 100;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-bar-wrapper';
        
        wrapper.innerHTML = `
            <span class="chart-value">${g.available_units}</span>
            <div class="chart-bar-container">
                <div class="chart-bar" style="height: ${pct}%"></div>
            </div>
            <span class="chart-label">${g.blood_group}</span>
        `;
        container.appendChild(wrapper);
    });
}

async function loadDashboardAlerts() {
    const list = document.getElementById('alerts-list');
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading alerts...</p></div>`;
    
    try {
        const alerts = await apiCall('/api/inventory/alerts');
        list.innerHTML = '';
        
        let alertsCount = 0;
        
        // Render expired units
        alerts.expired.forEach(unit => {
            alertsCount++;
            const item = document.createElement('div');
            item.className = 'alert-item danger';
            item.innerHTML = `
                <i class="fa-solid fa-circle-exclamation text-red"></i>
                <div class="alert-info">
                    <h5>Expired Stock: ${unit.blood_group}</h5>
                    <p>Barcode: ${unit.unit_barcode} | Expired on: ${new Date(unit.expiry_date).toLocaleDateString()}</p>
                </div>
            `;
            list.appendChild(item);
        });
        
        // Render near-expiry units
        alerts.near_expiry.forEach(unit => {
            alertsCount++;
            const item = document.createElement('div');
            item.className = 'alert-item warning';
            item.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation text-orange"></i>
                <div class="alert-info">
                    <h5>Near-Expiry Stock: ${unit.blood_group}</h5>
                    <p>Barcode: ${unit.unit_barcode} | Expires in: ${getDaysRemaining(unit.expiry_date)} days</p>
                </div>
            `;
            list.appendChild(item);
        });
        
        // Render low stock groups
        alerts.low_stock_groups.forEach(group => {
            alertsCount++;
            const item = document.createElement('div');
            item.className = 'alert-item warning';
            item.innerHTML = `
                <i class="fa-solid fa-droplet text-yellow"></i>
                <div class="alert-info">
                    <h5>Low Stock: Group ${group.blood_group}</h5>
                    <p>Only ${group.units_available} unit(s) remaining in repository.</p>
                </div>
            `;
            list.appendChild(item);
        });
        
        if (alertsCount === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-circle-check text-green"></i>
                    <p>All stock counts normal. No immediate alerts.</p>
                </div>
            `;
        }
    } catch (err) {
        list.innerHTML = `<div class="error-alert">Failed to fetch alerts.</div>`;
    }
}


// --- DONORS ---
async function loadDonorsData(searchQuery = '') {
    const tbody = document.querySelector('#donors-table tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading Donors...</td></tr>`;
    
    try {
        const url = searchQuery ? `/api/donors?query=${encodeURIComponent(searchQuery)}` : '/api/donors';
        state.donors = await apiCall(url);
        tbody.innerHTML = '';
        
        if (state.donors.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No donors registered matching that criteria.</td></tr>`;
            return;
        }
        
        state.donors.forEach(donor => {
            const tr = document.createElement('tr');
            
            const lastDonation = donor.last_donation_date 
                ? new Date(donor.last_donation_date).toLocaleDateString()
                : 'Never';
                
            const eligibilityClass = donor.eligibility_status ? 'eligible' : 'ineligible';
            const eligibilityIcon = donor.eligibility_status ? 'fa-circle-check' : 'fa-circle-xmark';
            const eligibilityText = donor.eligibility_status ? 'Eligible' : 'Deferred';
            
            tr.innerHTML = `
                <td><strong>${donor.name}</strong></td>
                <td><span class="role-pill bg-red-dim text-red" style="font-size: 0.85rem;">${donor.blood_group}</span></td>
                <td>${donor.age} / ${donor.gender}</td>
                <td>${donor.contact_number}<br><span style="font-size:0.75rem;" class="text-muted">${donor.email}</span></td>
                <td>
                    <span class="eligibility-indicator ${eligibilityClass}">
                        <i class="fa-solid ${eligibilityIcon}"></i> ${eligibilityText}
                    </span>
                </td>
                <td>${lastDonation}</td>
                <td class="table-actions">
                    <button class="btn btn-secondary btn-sm" onclick="loadDonorDetails(${donor.id})">
                        <i class="fa-solid fa-heart-circle-exclamation"></i> History / Donate
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-red">Failed to load donor database records.</td></tr>`;
    }
}

async function loadDonorDetails(donorId) {
    try {
        const donor = await apiCall(`/api/donors/${donorId}`);
        state.activeDonor = donor;
        
        // Render details summary
        document.getElementById('detail-donor-name').innerText = donor.name;
        document.getElementById('detail-donor-meta').innerText = `${donor.age} yrs | ${donor.gender} | ${donor.email}`;
        
        const bgBadge = document.getElementById('detail-donor-blood-group');
        bgBadge.innerText = donor.blood_group;
        
        document.getElementById('detail-donor-contact').innerText = donor.contact_number;
        
        const eligEl = document.getElementById('detail-donor-eligibility');
        if (donor.eligibility_status) {
            eligEl.innerHTML = `<span class="text-green"><i class="fa-solid fa-circle-check"></i> Eligible</span>`;
            document.getElementById('btn-record-new-donation').removeAttribute('disabled');
        } else {
            eligEl.innerHTML = `<span class="text-red"><i class="fa-solid fa-circle-xmark"></i> Deferred</span><br><span style="font-size:0.75rem;" class="text-muted">${donor.eligibility_notes || ''}</span>`;
            document.getElementById('btn-record-new-donation').setAttribute('disabled', 'true');
        }
        
        // Calculate last donation text and checks interval
        const warningDiv = document.getElementById('donation-eligibility-warning');
        warningDiv.classList.add('hide');
        
        const lastDonationText = donor.last_donation_date 
            ? new Date(donor.last_donation_date).toLocaleDateString()
            : 'Never';
        document.getElementById('detail-donor-last-date').innerText = lastDonationText;
        
        if (donor.last_donation_date) {
            const daysSince = Math.floor((new Date() - new Date(donor.last_donation_date)) / (1000 * 60 * 60 * 24));
            if (daysSince < 90 && donor.eligibility_status) {
                document.getElementById('btn-record-new-donation').setAttribute('disabled', 'true');
                warningDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Donor donated recently (${daysSince} days ago). 90 days recovery period required.`;
                warningDiv.classList.remove('hide');
            }
        }
        
        // Fetch donation history list
        const history = await apiCall(`/api/donors/${donorId}/history`);
        const listDiv = document.getElementById('donor-history-list');
        listDiv.innerHTML = '';
        
        if (history.length === 0) {
            listDiv.innerHTML = `<p class="text-muted" style="font-size:0.85rem; padding: 10px 0;">No donation transactions registered for this donor.</p>`;
        } else {
            history.forEach(don => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div class="history-item-left">
                        <h5>${don.quantity_ml} ml donation</h5>
                        <p>Barcode: ${don.blood_unit_barcode} | Date: ${new Date(don.collection_date).toLocaleDateString()}</p>
                    </div>
                    <span class="status-badge ${don.status.toLowerCase()}">${don.status}</span>
                `;
                listDiv.appendChild(item);
            });
        }
        
        openModal('modal-donor-details');
    } catch (err) {
        alert(`Failed to load donor profile details: ${err.message}`);
    }
}


// --- INVENTORY ---
async function loadInventoryData(bloodGroup = null) {
    const tbody = document.querySelector('#inventory-table tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading stock units...</td></tr>`;
    
    try {
        const url = bloodGroup ? `/api/inventory?blood_group=${encodeURIComponent(bloodGroup)}` : '/api/inventory';
        state.inventory = await apiCall(url);
        tbody.innerHTML = '';
        
        if (state.inventory.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No available blood units found.</td></tr>`;
            return;
        }
        
        state.inventory.forEach(unit => {
            const tr = document.createElement('tr');
            
            let statusText = unit.status;
            let statusClass = unit.status.toLowerCase();
            
            // Overwrite styling dynamically if expired but status not yet caught
            if (unit.is_expired) {
                statusText = 'EXPIRED';
                statusClass = 'expired';
            }
            
            tr.innerHTML = `
                <td><strong>${unit.unit_barcode}</strong></td>
                <td><span class="role-pill bg-red-dim text-red" style="font-size: 0.85rem;">${unit.blood_group}</span></td>
                <td>${unit.quantity_ml} ml</td>
                <td>${new Date(unit.collection_date).toLocaleDateString()}</td>
                <td>${new Date(unit.expiry_date).toLocaleDateString()}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-red">Error querying stock inventory.</td></tr>`;
    }
}


// --- REQUESTS ---
async function loadRequestsData(statusFilter = null) {
    const tbody = document.querySelector('#requests-table tbody');
    tbody.innerHTML = `<tr><td colspan="10" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading requests...</td></tr>`;
    
    try {
        const url = statusFilter ? `/api/requests?status_filter=${statusFilter}` : '/api/requests';
        state.requests = await apiCall(url);
        tbody.innerHTML = '';
        
        if (state.requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">No requests found.</td></tr>`;
            return;
        }
        
        state.requests.forEach(req => {
            const tr = document.createElement('tr');
            
            const actionsDisabled = (req.status !== 'Pending') ? 'disabled' : '';
            const statusClass = req.status.toLowerCase();
            const urgencyClass = req.urgency.toLowerCase();
            
            // Fulfill / Reject actions available only to Admin and Staff roles
            const canManage = (state.user.role === 'admin' || state.user.role === 'staff');
            
            let actionCell = '<span class="text-muted">Locked</span>';
            if (canManage && req.status === 'Pending') {
                actionCell = `
                    <button class="btn btn-secondary btn-sm" onclick="loadRequestManagement(${req.id})">
                        <i class="fa-solid fa-gears"></i> Process
                    </button>
                `;
            } else if (req.status !== 'Pending') {
                actionCell = `<span class="text-muted"><i class="fa-solid fa-lock"></i> Resolved</span>`;
            }
            
            tr.innerHTML = `
                <td><strong>#${req.id}</strong></td>
                <td><strong>${req.patient_name}</strong></td>
                <td>${req.requesting_hospital}</td>
                <td><span class="role-pill bg-red-dim text-red" style="font-size: 0.85rem;">${req.blood_group}</span></td>
                <td>${req.quantity_units}</td>
                <td><span class="urgency-badge ${urgencyClass}">${req.urgency}</span></td>
                <td>${new Date(req.request_date).toLocaleString()}</td>
                <td><span class="status-badge ${statusClass}">${req.status}</span></td>
                <td><span style="font-size: 0.78rem;" class="text-muted">${req.status_notes || '-'}</span></td>
                <td class="table-actions">${actionCell}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-red">Error querying transfusion requests database.</td></tr>`;
    }
}

async function loadRequestManagement(requestId) {
    const req = state.requests.find(r => r.id === requestId);
    if (!req) return;
    
    state.activeRequest = req;
    
    // Fill static text details
    document.getElementById('manage-req-patient').innerText = req.patient_name;
    document.getElementById('manage-req-hospital').innerText = req.requesting_hospital;
    document.getElementById('manage-req-group-qty').innerHTML = `<span class="role-pill bg-red-dim text-red">${req.blood_group}</span> x ${req.quantity_units} Unit(s)`;
    
    const urgEl = document.getElementById('manage-req-urgency');
    urgEl.innerText = req.urgency;
    urgEl.className = `urgency-tag ${req.urgency.toLowerCase()}`;
    
    // Reset forms
    document.getElementById('manage-req-status').value = 'Approved';
    document.getElementById('manage-req-notes').value = '';
    
    // Trigger action change handler manually to clear warnings or query stock
    const alertDiv = document.getElementById('fulfillment-stock-status');
    alertDiv.classList.add('hide');
    
    openModal('modal-manage-request');
}


// --- REPORTS ---
async function loadReportsData() {
    try {
        state.reports = await apiCall('/api/dashboard/reports');
        
        // Fill totals summary
        document.getElementById('report-total-donations').innerText = state.reports.summary.total_donations;
        document.getElementById('report-total-issued').innerText = state.reports.summary.total_issued;
        document.getElementById('report-total-expired').innerText = state.reports.summary.total_expired;
        
        renderReportsTable();
    } catch (err) {
        console.error("Error fetching operational reports:", err);
    }
}

function renderReportsTable() {
    if (!state.reports) return;
    
    const table = document.getElementById('report-data-table');
    table.innerHTML = '';
    
    if (state.reportsTab === 'donations') {
        // Headers
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Donation ID</th>
                    <th>Donor Name</th>
                    <th>Blood Group</th>
                    <th>Volume (ml)</th>
                    <th>Barcode</th>
                    <th>Date Collected</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        if (state.reports.donations.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No donations found.</td></tr>`;
            return;
        }
        
        state.reports.donations.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${d.id}</strong></td>
                <td>${d.donor_name}</td>
                <td><span class="role-pill bg-red-dim text-red">${d.blood_group}</span></td>
                <td>${d.quantity_ml} ml</td>
                <td><code>${d.barcode}</code></td>
                <td>${new Date(d.date).toLocaleString()}</td>
                <td><span class="status-badge ${d.status.toLowerCase()}">${d.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        // Requests Log
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Req ID</th>
                    <th>Patient Name</th>
                    <th>Hospital</th>
                    <th>Blood Group</th>
                    <th>Units</th>
                    <th>Urgency</th>
                    <th>Request Date</th>
                    <th>Status</th>
                    <th>Fulfillment Notes</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        if (state.reports.requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No blood requests found.</td></tr>`;
            return;
        }
        
        state.reports.requests.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${r.id}</strong></td>
                <td>${r.patient_name}</td>
                <td>${r.hospital}</td>
                <td><span class="role-pill bg-red-dim text-red">${r.blood_group}</span></td>
                <td>${r.quantity_units}</td>
                <td><span class="urgency-badge ${r.urgency.toLowerCase()}">${r.urgency}</span></td>
                <td>${new Date(r.date).toLocaleString()}</td>
                <td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td>
                <td><span style="font-size: 0.78rem;" class="text-muted">${r.notes || '-'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function handleExportCSV() {
    if (!state.reports) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    let filename = "";
    
    if (state.reportsTab === 'donations') {
        filename = "donations_report.csv";
        csvContent += "Donation ID,Donor Name,Blood Group,Volume ml,Barcode,Collection Date,Status\n";
        state.reports.donations.forEach(d => {
            csvContent += `"${d.id}","${d.donor_name}","${d.blood_group}","${d.quantity_ml}","${d.barcode}","${new Date(d.date).toISOString()}","${d.status}"\n`;
        });
    } else {
        filename = "blood_requests_report.csv";
        csvContent += "Request ID,Patient Name,Hospital,Blood Group,Quantity Units,Urgency,Request Date,Status,Fulfillment Notes\n";
        state.reports.requests.forEach(r => {
            csvContent += `"${r.id}","${r.patient_name}","${r.hospital}","${r.blood_group}","${r.quantity_units}","${r.urgency}","${new Date(r.date).toISOString()}","${r.status}","${r.notes || ''}"\n`;
        });
    }
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// --- AUDIT LOGS ---
async function loadAuditLogsData() {
    const tbody = document.querySelector('#audit-table tbody');
    tbody.innerHTML = `<tr><td colspan="4" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading Audit Trail...</td></tr>`;
    
    try {
        state.auditLogs = await apiCall('/api/dashboard/audit-logs');
        tbody.innerHTML = '';
        
        if (state.auditLogs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No audit logs found.</td></tr>`;
            return;
        }
        
        state.auditLogs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${new Date(log.timestamp).toLocaleString()}</code></td>
                <td><strong class="text-blue">${log.username}</strong></td>
                <td><span class="role-pill" style="font-size: 0.72rem;">${log.action}</span></td>
                <td><span style="font-size: 0.85rem;">${log.details}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-red">Failed to read system audit records.</td></tr>`;
    }
}


// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getDaysRemaining(expiryDateStr) {
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
