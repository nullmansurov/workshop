// access.js

// Click handler for the "Access" button
document.getElementById("access").addEventListener("click", function () {
    // Use the global variable window.currentProject
    const projectName = window.currentProject;
    if (!projectName) {
        alert('Project not selected! Please select a project before sharing.');
        return;
    }

    // Perform a GET request to the /access endpoint, passing project_name
    fetch('/access?project_name=' + encodeURIComponent(projectName), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.access) {
                // If the project is already shared, show the link
                showModal(data.share_url);
            } else {
                // If access is not open - offer to enter a share_id to grant access
                showModalForNewShareId();
            }
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Something went wrong');
    });
});

// Function to show a modal with the share link and a button to remove access
function showModal(shareUrl) {
    // Convert shareUrl to a relative link and decode Cyrillic characters
    let relativeUrl = shareUrl;
    try {
        const urlObj = new URL(shareUrl);
        relativeUrl = decodeURIComponent(urlObj.pathname);
    } catch (e) {
        console.error('URL conversion error:', e);
    }

    const modalContent = `
        <div class="modal-header">
            <h5 class="modal-title" id="modalLabel">Project is shared</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">×</span>
            </button>
        </div>
        <div class="modal-body">
            <p>Link to access the project:</p>
            <a href="${relativeUrl}" target="_blank">${relativeUrl}</a>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
            <button type="button" class="btn btn-danger" id="deleteAccess">Remove access</button>
        </div>
    `;
    document.getElementById('modalContent').innerHTML = modalContent;
    $('#accessModal').modal('show');

    // Handler for removing access
    document.getElementById('deleteAccess').addEventListener('click', function () {
        if (!window.currentProject) {
            alert('Project not selected!');
            return;
        }
        if (!confirm('Are you sure you want to remove sharing access?')) {
            return;
        }
        fetch('/access', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ project_name: window.currentProject })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Sharing access has been removed');
                $('#accessModal').modal('hide');
            } else {
                alert('Error: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Something went wrong');
        });
    });
}

// Function to show a modal with a form to enter share_id
function showModalForNewShareId() {
    const modalContent = `
        <div class="modal-header">
            <h5 class="modal-title" id="modalLabel">Share project</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">×</span>
            </button>
        </div>
        <div class="modal-body">
            <form id="shareForm">
                <div class="form-group">
                    <label for="share_id">Enter access identifier (share_id):</label>
                    <input type="text" class="form-control" id="share_id" required>
                </div>
            </form>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="saveShareId">Save</button>
        </div>
    `;
    document.getElementById('modalContent').innerHTML = modalContent;
    $('#accessModal').modal('show');

    // Handler for the "Save" button inside the modal
    document.getElementById('saveShareId').addEventListener('click', function () {
        const shareId = document.getElementById('share_id').value;
        if (!shareId) {
            alert('Please specify the access identifier (share_id)');
            return;
        }
        saveShareId(shareId);
    });
}

// Function to send a POST request with the data to open access
function saveShareId(shareId) {
    const projectName = window.currentProject;
    if (!projectName) {
        alert('Project not selected!');
        return;
    }
    fetch('/access', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ project_name: projectName, share_id: shareId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Access granted! Link: ' + data.share_url);
            $('#accessModal').modal('hide');
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Something went wrong');
    });
}