document.getElementById('visibility').addEventListener('click', () => {
  const getProjectName = () => window.currentProject;
  const projectName = getProjectName();
  if (!projectName) {
    alert('Project not selected! Please select a project before managing visibility.');
    return;
  }

  // Removing previous overlay if it exists
  let overlay = document.getElementById('visibility-modal-overlay');
  if (overlay) {
    loadVisibility();
    overlay.style.display = 'flex';
    return;
  }

  // Creating overlay and toast container
  overlay = document.createElement('div');
  overlay.id = 'visibility-modal-overlay';
  overlay.classList.add('visibility-overlay');
  document.body.appendChild(overlay);

  const toastContainer = document.createElement('div');
  toastContainer.id = 'visibility-toast-container';
  toastContainer.classList.add('visibility-toast-container');
  overlay.appendChild(toastContainer);

  // Function to display toasts
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `visibility-toast visibility-toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('visibility-toast-hide');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
  }

  // Creating the modal
  const modal = document.createElement('div');
  modal.id = 'visibility-modal';
  modal.classList.add('visibility-modal');
  overlay.appendChild(modal);

  const title = document.createElement('h3');
  title.textContent = 'Manage Project Visibility';
  modal.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.classList.add('visibility-close-btn');
  closeBtn.onclick = () => overlay.remove();
  modal.appendChild(closeBtn);

  const msg = document.createElement('div');
  msg.id = 'visibility-modal-message';
  msg.classList.add('visibility-msg');
  modal.appendChild(msg);

  // Role section layout
  const roleSection = document.createElement('div');
  roleSection.id = 'visibility-role-section';
  roleSection.innerHTML = '<h4>Role-based Access</h4>';
  ['viewer', 'user', 'admin'].forEach(role => {
    const label = document.createElement('label');
    label.classList.add('visibility-role-label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'visibility-role-checkbox';
    cb.value = role;
    cb.id = `visibility-role-${role}`;
    label.appendChild(cb);
    label.append(` ${role}`);
    roleSection.appendChild(label);
  });
  const saveRolesBtn = document.createElement('button');
  saveRolesBtn.textContent = 'Save Roles';
  saveRolesBtn.className = 'btn btn-primary btn-sm visibility-save-roles';
  roleSection.appendChild(saveRolesBtn);
  modal.appendChild(roleSection);

  // User section layout
  const userSection = document.createElement('div');
  userSection.id = 'visibility-user-section';
  userSection.innerHTML = '<h4>Individual Access</h4>' +
    `<table class="visibility-user-table">
      <thead><tr><th>User</th><th>Action</th></tr></thead>
      <tbody id="visibility-user-tbody"></tbody>
    </table>`;
  const userForm = document.createElement('form');
  userForm.id = 'visibility-user-form';
  userForm.innerHTML = `
    <input type="text" id="visibility-user-input" placeholder="Enter username" />
    <input type="hidden" id="visibility-user-id" />
    <button type="submit" class="btn btn-success btn-sm">Add User</button>
  `;
  userSection.appendChild(userForm);
  modal.appendChild(userSection);

  // Function to load visibility settings
  async function loadVisibility() {
    const p = getProjectName();
    msg.textContent = '';
    document.querySelectorAll('input[name="visibility-role-checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('visibility-user-tbody').innerHTML = '';
    try {
      const resp = await fetch(`/visibility?project_name=${encodeURIComponent(p)}`);
      const data = await resp.json();
      if (!data.success) { showToast(data.error, 'error'); return; }
      data.visibilities.forEach(v => {
        if (v.user_id === null) {
          const cb = document.getElementById(`visibility-role-${v.role}`);
          if (cb) cb.checked = true;
        } else {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${v.username}</td>
            <td><button class="btn btn-danger btn-sm" data-role="${v.role}" data-uid="${v.user_id}">Delete</button></td>
          `;
          tr.querySelector('button').onclick = () => deleteUserAccess(v.role, v.user_id);
          document.getElementById('visibility-user-tbody').appendChild(tr);
        }
      });
    } catch {
      showToast('Error loading visibility settings', 'error');
    }
  }

  // Save roles handler
  saveRolesBtn.onclick = async () => {
    const p = getProjectName();
    const selected = Array.from(document.querySelectorAll('input[name="visibility-role-checkbox"]:checked')).map(cb => cb.value);
    try {
      await Promise.all(selected.map(role =>
        fetch('/visibility', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({project_name:p, role, user_id:null}) })
      ));
      showToast('Role-based visibility updated');
      loadVisibility();
    } catch {
      showToast('Error updating roles', 'error');
    }
  };

  // User search
  let searchTimer;
  document.getElementById('visibility-user-input').addEventListener('input', e => {
    const input = e.target;
    clearTimeout(searchTimer);
    document.getElementById('visibility-user-id').value = '';
    if (input.value.length < 2) return;
    searchTimer = setTimeout(async () => {
      try {
        const resp = await fetch(`/search_user?q=${encodeURIComponent(input.value)}`);
        const {success, users} = await resp.json();
        if (success && users.length) {
          document.getElementById('visibility-user-id').value = users[0].id;
          input.value = users[0].username;
        } else {
          showToast('User not found', 'error');
        }
      } catch {
        showToast('Error searching for user', 'error');
      }
    }, 300);
  });

  // Add user handler
  userForm.onsubmit = async e => {
    e.preventDefault();
    const p = getProjectName();
    const uid = document.getElementById('visibility-user-id').value;
    if (!uid) { showToast('Please select a user first', 'error'); return; }
    try {
      const resp = await fetch('/visibility', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_name:p, role:'viewer', user_id:uid}) });
      const data = await resp.json();
      if (!data.success) { showToast(data.error, 'error'); return; }
      showToast('Individual access added');
      loadVisibility();
    } catch {
      showToast('Error adding user', 'error');
    }
  };

  // Delete user access handler
  async function deleteUserAccess(role, uid) {
    const p = getProjectName();
    try {
      await fetch('/visibility', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_name:p, role, user_id:uid}) });
      showToast('Individual access removed');
      loadVisibility();
    } catch {
      showToast('Error removing user', 'error');
    }
  }

  // Initialization
  loadVisibility();

  // Close on click outside the modal
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
});