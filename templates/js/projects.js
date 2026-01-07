$(document).ready(function(){
  // Global variables
  window.currentProject = null;
  window.canEdit = false;       // true – edit mode, false – view only
  window.heartbeatInterval = null;
  window.autoRefreshInterval = null;

  // Additional variables for autosave
  var autoSaveTimer = null;
  var autoSaveXHR = null;

  // Function to cancel autosave (timer and AJAX request)
  function cancelAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (autoSaveXHR && autoSaveXHR.readyState !== 4) {
      autoSaveXHR.abort();
      autoSaveXHR = null;
    }
  }

  // Function to start autosave with debounce
  function startAutoSave() {
    // Reset the previous timer if it exists
    if(autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function(){
      var project = window.currentProject;
      var content = $('#editor').html();
      if (!project || !window.canEdit) return;
      // If content is empty, do not save (can be configured as needed)
      if (!content || content.trim() === "") return;
      
      // Save the current project in a local variable to ensure relevance in the callback
      var currentSnapshot = project;
      
      // Send a save request and save the jqXHR for the possibility of cancellation
      autoSaveXHR = saveProject(currentSnapshot, content, function(data){
         // Check that the active project has not changed during saving
         if(window.currentProject === currentSnapshot) {
           console.log("Autosave complete:", data);
         } else {
           console.log("Autosave result for an outdated project has been ignored.");
         }
      });
      
      autoSaveTimer = null;
    }, 3000);
  }

// Attach delegated handlers once after the page loads
$('#projects-container')
  .on('click', '.project-item', function () {
    const projectName = $(this).data('project');
    openProject(projectName);
  })
  .on('contextmenu', '.project-item', function (e) {
    e.preventDefault();
    const projectName = $(this).data('project');
    showContextMenu(projectName, e.pageX, e.pageY);
  });

function openProject(project) {
  if (typeof cancelAutoSave === 'function') cancelAutoSave();

  if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
  if (window.autoRefreshInterval) {
    clearInterval(window.autoRefreshInterval);
    window.autoRefreshInterval = null;
  }

  window.currentProject = project;

  $.get('/load_project', { project_name: project })
    .done(function (data) {
      if (data.success) {
        $('#editor').html(data.content);

        $('#main-header').fadeOut(200, function () {
          $(this).text(project).fadeIn(200);
        });

        document.title = project + " | Workshop";

        resetAudioPlayer();

        window.canEdit = data.can_edit;
        handleEditModeChange(data);
        window.heartbeatInterval = setInterval(sendHeartbeat, 3000);

        // Update the project list
        const $projectEl = $('.project-item[data-project="' + project + '"]');

        if ($projectEl.length) {
          // If the project is already in the DOM - move it to the top
          $('#projects-container').prepend($projectEl);
        } else {
          // If the project does not exist - create and add it to the beginning
          const newProjectItem = $('<div class="project-item" data-project="' + project + '"><span class="proj-name">' + project + '</span></div>');

          newProjectItem.on('click', function () {
            openProject(project);
          }).on('contextmenu', function (e) {
            e.preventDefault();
            showContextMenu(project, e.pageX, e.pageY);
          });

          $('#projects-container').prepend(newProjectItem);
        }

        // Update the selection
        $('.project-item').removeClass('selected');
        $('.project-item[data-project="' + project + '"]').addClass('selected');

        // Scroll to the top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Save the last project
        sessionStorage.setItem('lastOpenedProject', project);

      } else {
        $('#editor').html('');
        $('#main-header').text("Workshop - Library");
        document.title = "Workshop - Projects";
        alert(data.error);
      }
    })
    .fail(function () {
      alert("Error loading project. Check your connection.");
    });
}

$(document).ready(function () {
  const lastProject = sessionStorage.getItem('lastOpenedProject');
  if (lastProject) {
    openProject(lastProject);
  }
});


function handleEditModeChange(data) {
  if (!data.notify) return;

  if (data.can_edit) {
    enableEditingMode();
    if (data.became_editor_after_queue) {
      alert("The previous editor has left, you can now edit the project.");
    }
  } else if (data.in_queue) {
    enableViewOnlyMode();
    alert("The project is currently being edited by " + (data.editor || "another user") + ". You have been added to the editing queue.");
  } else {
    enableViewOnlyMode();
  }
}

function sendHeartbeat() {
  if (!window.currentProject) return;
  $.post('/heartbeat', { project_name: window.currentProject }, function(data) {
    if (data.success) {
      if (data.notify) {
        if (data.can_edit) {
          enableEditingMode();
          if (data.became_editor_after_queue) {
            alert("The previous editor has left, you can now edit the project.");
          }
        } else if (data.in_queue) {
          enableViewOnlyMode();
          alert("The project is currently being edited by " + (data.editor || "another user") + ". You have been added to the editing queue.");
        } else {
          enableViewOnlyMode();
        }
      }
      window.canEdit = data.can_edit;
    }
  });
}



function showContextMenu(project, x, y) {
  var isFav = $('.project-item[data-project="' + project + '"]').data('fav') === '★';
  $('#ctx-fav').text(isFav ? 'Remove from favorites' : 'Add to favorites');
  $('#context-menu').data('project', project)
    .css({ top: y, left: x })
    .fadeIn(200);
}

$(document).on('click', function (e) {
  if (!$(e.target).closest('#context-menu').length) {
    $('#context-menu').fadeOut(200);
  }
});

$('#ctx-open').click(function () {
  var project = $('#context-menu').data('project');
  openProject(project);
  $('#context-menu').fadeOut(200);
});


// Edit mode: before giving editing access, we pull the current content once
function enableEditingMode() {
  // 1) cancel auto-refresh from view mode (if it was active)
  if (window.autoRefreshInterval) {
    clearInterval(window.autoRefreshInterval);
    window.autoRefreshInterval = null;
  }

  // 2) pull the latest content
  if (window.currentProject) {
    $.get('/get_project_content', { project_name: window.currentProject }, function(data) {
      if (data.success) {
        $('#editor').html(data.content);
      }
      // 3) only after loading - enable the editor and autosave
      activateEditor();
    });
  } else {
    activateEditor();
  }

  function activateEditor() {
    $('#editor')
      .attr('contenteditable', true)
      .off('input.autoSave')
      .on('input.autoSave', startAutoSave);
  }
}

// View mode: just make it readonly, without autosave and without auto-refresh
function enableViewOnlyMode() {
  // Cancel autosave
  cancelAutoSave();
  $('#editor').off('input.autoSave');

  // Makes the content read-only
  $('#editor').attr('contenteditable', false);

  // No more setInterval for auto-refresh
  if (window.autoRefreshInterval) {
    clearInterval(window.autoRefreshInterval);
    window.autoRefreshInterval = null;
  }
}


  // Save function with chunk support.
  // Returns jqXHR to allow for request cancellation.
  function saveProject(project, content, callback) {
    var maxChunkSize = 100 * 1024; // 100 KB
    if (content.length > maxChunkSize) {
      var chunks = [];
      for (var i = 0; i < content.length; i += maxChunkSize) {
        chunks.push(content.substring(i, i + maxChunkSize));
      }
      var totalChunks = chunks.length;
      function sendChunk(index) {
        return $.post('/save_project', {
          project_name: project,
          content: chunks[index],
          chunk_number: index + 1,
          total_chunks: totalChunks
        }, function(data) {
          if (data.success) {
            if (index < totalChunks - 1) {
              sendChunk(index + 1);
            } else {
              if (callback) callback(data);
            }
          } else {
            if (callback) callback(data);
          }
        });
      }
      return sendChunk(0);
    } else {
      return $.post('/save_project', {
        project_name: project,
        content: content,
        chunk_number: 1,
        total_chunks: 1
      }, function(data) {
        if (callback) callback(data);
      });
    }
  }
  
// Project search handler
$('#search-projects').on('input', function () {
  var query = $(this).val().trim();

  $.get('/search_projects', { query: query, offset: 0, limit: 10 }, function (data) {
    if (data.success) {
      var container = $('#projects-container');
      container.empty();

      data.projects.forEach(function (project) {
        var projectItem = $('<div class="project-item" data-project="' + project + '"><span class="proj-name">' + project + '</span></div>');

        projectItem.on('click', function () {
          openProject(project);
        }).on('contextmenu', function (e) {
          e.preventDefault();
          showContextMenu(project, e.pageX, e.pageY);
        });

        container.append(projectItem);
      });
    } else {
      alert(data.error);
    }
  });
});

  // Fixing the "Load More" button - it no longer reloads the page and appends new projects
  $('#load_more').on('click', function(e){
    e.preventDefault(); // prevents page reload
    var query = $('#search-projects').val().trim();
    var currentCount = $('.project-item').length;
    $.get('/search_projects', { query: query, offset: currentCount, limit: 10 }, function(data){
      if(data.success){
        var container = $('#projects-container');
        data.projects.forEach(function(project){
          var projectItem = $('<div class="project-item" data-project="'+ project +'"><span class="proj-name">'+ project +'</span></div>');
          projectItem.on('click', function(){
            openProject(project);
          }).on('contextmenu', function(e){
            e.preventDefault();
            showContextMenu(project, e.pageX, e.pageY);
          });
          container.append(projectItem);
        });
      } else {
        alert(data.error);
      }
    });
  });

  // Context menu handling for project items
  $('.project-item').each(function(){
    var $item = $(this);
    var project = $item.data('project');
    $item.on('click', function(){
      openProject(project);
    });
    $item.on('contextmenu', function(e){
      e.preventDefault();
      showContextMenu(project, e.pageX, e.pageY);
    });
  });
  
  function showContextMenu(project, x, y) {
    var isFav = $('.project-item[data-project="' + project + '"]').data('fav') === '★';
    $('#ctx-fav').text(isFav ? 'Remove from favorites' : 'Add to favorites');
    $('#context-menu').data('project', project)
      .css({ top: y, left: x })
      .fadeIn(200);
  }
  
  $(document).on('click', function(e){
    if (!$(e.target).closest('#context-menu').length) {
      $('#context-menu').fadeOut(200);
    }
  });
  
  $('#ctx-open').click(function(){
    var project = $('#context-menu').data('project');
    openProject(project);
    $('#context-menu').fadeOut(200);
  });
  
  $('#ctx-rename').click(function() {
    var project = $('#context-menu').data('project');
    var rawNewName = prompt("Enter the new project name", project);
    if (rawNewName) {
      var newName = rawNewName.trim();
      if (newName && newName !== project) {
        $.ajax({
          url: '/rename_project',
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
          data: {
            old_name: project,
            new_name: newName
          },
          success: function(data) {
            if (data.success) {
              $('[data-project="' + project + '"]').text(newName);
              $('#context-menu').data('project', newName);
              showNotification('Project renamed successfully', 'success');
            } else {
              showNotification('Error: ' + data.error, 'error');
            }
          },
          error: function(xhr) {
            showNotification('Connection error: ' + xhr.statusText, 'error');
          },
          complete: function() {
            $('#context-menu').fadeOut(200);
          }
        });
      }
    } else {
      $('#context-menu').fadeOut(200);
    }
  });
  
$('#ctx-delete').click(function () {
  var project = $('#context-menu').data('project');
  if (confirm("Are you sure you want to delete the project \"" + project + "\"?")) {
    $.post('/delete_project', { project_name: project }, function (data) {
      if (data.success) {
        // Delete lastOpenedProject if it matches the one being deleted
        const lastProject = sessionStorage.getItem('lastOpenedProject');
        if (lastProject === project) {
          sessionStorage.removeItem('lastOpenedProject');
        }

        location.reload();
      } else {
        alert(data.error);
      }
    });
  }
});

  
  $('#ctx-fav').click(function(){
    var project = $('#context-menu').data('project');
    var isFav = $('.project-item[data-project="' + project + '"]').data('fav') === '★';
    var action = isFav ? 'remove' : 'add';
    $.post('/favorite_project', { project_name: project, action: action }, function(data){
      if (data.success) { 
        var $item = $('.project-item[data-project="' + project + '"]');
        if (action === 'add') {
          $item.data('fav', '★')
               .find('.proj-name').html('★ ' + project);
          $('#projects-container').prepend($item.detach());
        } else {
          $item.data('fav', '')
               .find('.proj-name').text(project);
          $('#projects-container').append($item.detach());
        }
      }
    });
  });
  
$('#new-project').click(function() {
  var name = prompt("Enter the name of the new project");
  if (name) {
    $.post('/create_project', { project_name: name }, function(data) {
      if (data.success) {
        // Instead of reload - open the newly created project
        openProject(data.project);
      } else {
        alert(data.error);
      }
    });
  }
});


  
  // Manual project save
  $('#save').click(function(){
    cancelAutoSave();
    var project = window.currentProject;
    if (!project) {
      alert("Select a project");
      return;
    }
    var content = $('#editor').html();
    saveProject(project, content, function(data){
      if (data.success) { 
        alert("Saved"); 
      } else { 
        alert(data.error); 
      }
    });
  });

$(document).keydown(function(e) {
    if (e.ctrlKey && e.which === 81) { // Ctrl + Q
      e.preventDefault();
      cancelAutoSave();
      var project = window.currentProject;
      if (!project) {
        alert("Select a project");
        return;
      }
      var content = $('#editor').html();
      saveProject(project, content, function(data){
        if (data.success) { 
          alert("Saved"); 
        } else { 
          alert(data.error); 
        }
      });
    }
  });
});