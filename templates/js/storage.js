$(document).ready(function() {
    // Function to open the project folder via the /storage_open endpoint
    function openProjectFolder() {
        if (!window.currentProject) {
            alert("Select a project");
            return;
        }
        $.ajax({
            url: '/storage_open',
            type: 'GET',
            data: { project_name: window.currentProject },
            success: function(response) {
                if (response.success) {
                    alert("Explorer opened");
                } else {
                    alert("Error: " + response.error);
                }
            },
            error: function(err) {
                alert("Request error: " + err.responseText);
            }
        });
    }

    // Function to open the "Storage" modal window
    function openStorageModal() {
        if (!window.currentProject) {
            alert("Select a project");
            return;
        }
        // Requesting the list of files for the current project
        $.ajax({
            url: '/storage_api',
            type: 'GET',
            data: { project_name: window.currentProject },
            success: function(response) {
                if (response.success) {
                    var modalHtml = '<div id="storage-modal-overlay"></div>';
                    modalHtml += '<div id="storage-modal">';
                    modalHtml += '<div id="storage-modal-header"><h3>File Storage</h3><button id="storage-modal-close">×</button></div>';
                    modalHtml += '<div id="storage-modal-body">';
                    if (response.files.length === 0) {
                        modalHtml += '<p>No files found.</p>';
                    } else {
                        modalHtml += '<table id="storage-file-table"><thead><tr><th><input type="checkbox" id="select-all-files"></th><th>Filename</th><th>Actions</th></tr></thead><tbody>';
                        $.each(response.files, function(index, filename) {
                            var ext = filename.split('.').pop().toLowerCase();
                            modalHtml += '<tr data-filename="'+filename+'">';
                            modalHtml += '<td><input type="checkbox" class="file-checkbox"></td>';
                            modalHtml += '<td>'+filename+'</td>';
                            modalHtml += '<td>';
                            // "Embed" button (keeping the old logic)
                            modalHtml += '<button class="embed-file-btn">Embed</button> ';
                            // If the file is a video, add a button to create a player marker (will be the "Player" button)
                            if (["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
                                modalHtml += '<button class="player-file-btn">Player</button> ';
                            }
                            modalHtml += '<button class="download-file-btn">Download</button> ';
                            modalHtml += '<button class="delete-file-btn">Delete</button>';
                            modalHtml += '</td>';
                            modalHtml += '</tr>';
                        });
                        modalHtml += '</tbody></table>';
                        modalHtml += '<div id="storage-bulk-actions">';
                        modalHtml += '<button id="embed-selected-btn">Embed Selected</button> ';
                        modalHtml += '<button id="delete-selected-btn">Delete Selected</button>';
                        modalHtml += '</div>';
                    }
                    
                    modalHtml += '</div>'; // #storage-modal-body
                    modalHtml += '</div>'; // #storage-modal

                    $('body').append(modalHtml);

                    // Closing the modal window
                    $('#storage-modal-close, #storage-modal-overlay').on('click', function() {
                        $('#storage-modal, #storage-modal-overlay').remove();
                    });

                    // "Select All" handler
                    $('#select-all-files').on('change', function() {
                        $('.file-checkbox').prop('checked', $(this).prop('checked'));
                    });

                    // Handler for single embedding
                    $('.embed-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        embedFile(filename);
                        $('#storage-modal, #storage-modal-overlay').remove();
                    });

                    // Handler for the "Player" button (for video files)
                    $('.player-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var newVideo = { title: filename, file: fileUrl };
                        
                        // Check if a player button already exists in the editor
                        var $marker = $('#editor').find('#video-player-button');
                        if ($marker.length === 0) {
                            var playerData = { videos: [newVideo] };
                            var jsonData = JSON.stringify(playerData);
                            var buttonHtml = '<button id="video-player-button" data-videos=\'' + jsonData + '\' contenteditable="false" class="video-btn">Watch</button>';
                            $('#editor').append(buttonHtml);
                        } else {
                            var existingData = $marker.attr('data-videos');
                            try {
                                var oldData = existingData ? JSON.parse(existingData) : { videos: [] };
                                if (!oldData.videos || !Array.isArray(oldData.videos)) {
                                    oldData.videos = [];
                                }
                                oldData.videos.push(newVideo);
                                $marker.attr('data-videos', JSON.stringify(oldData));
                            } catch (e) {
                                console.error("Error parsing player data:", e);
                            }
                        }
                        alert("Video added. To watch, click the 'Watch' button in the editor.");
                    });

                    // Handler for downloading a file
                    $('.download-file-btn').on('click', function(e) {
                        e.preventDefault();
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var a = document.createElement('a');
                        a.href = fileUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    });

                    // Handler for single deletion
                    $('.delete-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        if (confirm("Delete file " + filename + "?")) {
                            deleteFiles([filename], function() {
                                refreshStorageList();
                            });
                        }
                    });

                    // Bulk embedding of selected files
                    $('#embed-selected-btn').on('click', function() {
                        var selectedFiles = [];
                        $('.file-checkbox:checked').each(function() {
                            var filename = $(this).closest('tr').data('filename');
                            selectedFiles.push(filename);
                        });
                        if (selectedFiles.length === 0) {
                            alert("Select at least one file to embed.");
                        } else {
                            $.each(selectedFiles, function(index, filename) {
                                embedFile(filename);
                            });
                            $('#storage-modal, #storage-modal-overlay').remove();
                        }
                    });

                    // Bulk deletion of selected files
                    $('#delete-selected-btn').on('click', function() {
                        var selectedFiles = [];
                        $('.file-checkbox:checked').each(function() {
                            var filename = $(this).closest('tr').data('filename');
                            selectedFiles.push(filename);
                        });
                        if (selectedFiles.length === 0) {
                            alert("Select at least one file to delete.");
                        } else {
                            if (confirm("Delete selected files?")) {
                                deleteFiles(selectedFiles, function() {
                                    refreshStorageList();
                                });
                            }
                        }
                    });

                    // Handler for the button to open the folder in the explorer
                    $('#open-storage-folder-btn').on('click', function() {
                        openProjectFolder();
                    });
                } else {
                    alert("Error: " + response.error);
                }
            },
            error: function(err) {
                alert("Request error: " + err.responseText);
            }
        });
    }

    // Function to refresh the file list in the modal window
    function refreshStorageList() {
        if (!window.currentProject) return;
        $.ajax({
            url: '/storage_api',
            type: 'GET',
            data: { project_name: window.currentProject },
            success: function(response) {
                if (response.success) {
                    var tbody = '';
                    if (response.files.length === 0) {
                        tbody = '<tr><td colspan="3">No files found.</td></tr>';
                    } else {
                        $.each(response.files, function(index, filename) {
                            var ext = filename.split('.').pop().toLowerCase();
                            tbody += '<tr data-filename="'+filename+'">';
                            tbody += '<td><input type="checkbox" class="file-checkbox"></td>';
                            tbody += '<td>'+filename+'</td>';
                            tbody += '<td>';
                            tbody += '<button class="embed-file-btn">Embed</button> ';
                            if (["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
                                tbody += '<button class="player-file-btn">Player</button> ';
                            }
                            tbody += '<button class="download-file-btn">Download</button> ';
                            tbody += '<button class="delete-file-btn">Delete</button>';
                            tbody += '</td>';
                            tbody += '</tr>';
                        });
                    }
                    $('#storage-file-table tbody').html(tbody);
                    $('#select-all-files').prop('checked', false);
                    $('.embed-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        embedFile(filename);
                        $('#storage-modal, #storage-modal-overlay').remove();
                    });
                    $('.player-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var newVideo = { title: filename, file: fileUrl };
                        var $marker = $('#editor').find('#video-player-button');
                        if ($marker.length === 0) {
                            var playerData = { videos: [newVideo] };
                            var jsonData = JSON.stringify(playerData);
                            var buttonHtml = '<button id="video-player-button" data-videos=\'' + jsonData + '\' contenteditable="false" class="video-btn">Watch</button>';
                            $('#editor').append(buttonHtml);
                        } else {
                            var existingData = $marker.attr('data-videos');
                            try {
                                var oldData = existingData ? JSON.parse(existingData) : { videos: [] };
                                if (!oldData.videos || !Array.isArray(oldData.videos)) {
                                    oldData.videos = [];
                                }
                                oldData.videos.push(newVideo);
                                $marker.attr('data-videos', JSON.stringify(oldData));
                            } catch (e) {
                                console.error("Error parsing player data:", e);
                            }
                        }
                        alert("Video added. To watch, click the 'Watch' button in the editor.");
                    });
                    $('.download-file-btn').on('click', function(e) {
                        e.preventDefault();
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var a = document.createElement('a');
                        a.href = fileUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    });
                    $('.delete-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        if (confirm("Delete file " + filename + "?")) {
                            deleteFiles([filename], function() {
                                refreshStorageList();
                            });
                        }
                    });
                }
            },
            error: function(err) {
                alert("Error updating list: " + err.responseText);
            }
        });
    }

    // Function to delete files (AJAX DELETE request)
    function deleteFiles(fileList, callback) {
        $.ajax({
            url: '/storage_api',
            type: 'DELETE',
            contentType: 'application/json',
            data: JSON.stringify({ project_name: window.currentProject, files: fileList }),
            success: function(response) {
                if (response.success) {
                    alert("File(s) successfully deleted.");
                    if (typeof callback === 'function') {
                        callback();
                    }
                } else {
                    alert("Deletion error: " + response.error);
                }
            },
            error: function(err) {
                alert("Request error: " + err.responseText);
            }
        });
    }

    // Function to embed a file in the editor
    function embedFile(filename) {
        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
        var ext = filename.split('.').pop().toLowerCase();
        var tag = "";
        if (["mp3", "wav", "ogg"].indexOf(ext) >= 0) {
            // Embed a custom audio player with unique IDs
            var existingAudios = $('#editor').find('audio').length;
            var audioId = 'audio' + existingAudios;
            var progressBarId = 'progress-bar' + existingAudios;
            var currentTimeId = 'current-time' + existingAudios;
            var durationId = 'duration' + existingAudios;
            tag = 
            '<br>' +
            '<div class="custom-audio-player" contenteditable="false">' +
              '<audio id="' + audioId + '" preload="metadata" src="' + fileUrl + '" ontimeupdate="updateProgress(\'' + audioId + '\', \'' + progressBarId + '\', \'' + currentTimeId + '\')"></audio>' +
              '<button class="play-btn" onclick="playAudio(\'' + audioId + '\')">play</button>' +
              '<button class="pause-btn" onclick="pauseAudio(\'' + audioId + '\')">pause</button>' +
              '<button class="stop-btn" onclick="stopAudio(\'' + audioId + '\', \'' + progressBarId + '\', \'' + currentTimeId + '\')">stop</button>' +
              '<div class="progress-container">' +
                '<div class="progress-bar" id="' + progressBarId + '"></div>' +
              '</div>' +
              '<span class="time" id="' + durationId + '">0:00</span>' +
            '</div>' +
            '<br>';
            $('#editor').append(tag);
            var audioEl = document.getElementById(audioId);
            audioEl.onloadedmetadata = function() {
                document.getElementById(durationId).textContent = formatAudioTime(audioEl.duration);
            };
        } else if (["jpg", "jpeg", "png", "gif"].indexOf(ext) >= 0) {
            tag = "<br><img src='" + fileUrl + "' style='max-width:100%; display:block; margin:10px auto;' class='resizable draggable'><br>";
            $('#editor').append(tag);
        } else if (["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
            tag = "<br><video controls style='max-width:100%; display:block; margin:10px auto;'>" +
                  "<source src='" + fileUrl + "' type='video/" + ext + "'>" +
                  "Your browser does not support the video tag." +
                  "</video><br>";
            $('#editor').append(tag);
        } else {
            tag = "<br><a href='" + fileUrl + "' target='_blank'>" + filename + "</a><br>";
            $('#editor').append(tag);
        }
    }

    // Bind the click handler to the "Storage" button
    $('#storage').on('click', function() {
        openStorageModal();
    });

    // Global handler for the Ctrl+Shift+S hotkey (opening the project folder)
    $(document).on('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.which === 83) {  // 83 corresponds to the "S" key
            e.preventDefault();
            openProjectFolder();
        }
    });
});

function formatAudioTime(seconds) {
  var minutes = Math.floor(seconds / 60);
  var secs = Math.floor(seconds % 60);
  return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}