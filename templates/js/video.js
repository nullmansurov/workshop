$(document).ready(function() {

  // If the progress bar element doesn't exist yet, create it.
  if ($('#upload-progress').length === 0) {
    $('body').append(
      '<div id="upload-progress" style="display:none; width:300px; border: 1px solid #ccc; margin-top:10px;">' +
        '<div id="progress-bar" style="width:0%; height:20px; background:green;"></div>' +
      '</div>'
    );
  }

  /**
   * Creates an external container for the player and initializes it with the provided videos.
   * @param {Array} videos - An array of video objects, for example:
   *   [ { title: "video1.mp4", file: "/workspace/Project/video1.mp4" }, ... ]
   */
  window.createExternalVideoPlayer = function(videos) {
    var $placeholder = $('#video-placeholder');
    if ($placeholder.length === 0) {
      $placeholder = $('<div id="video-placeholder"></div>');
      $('body').append($placeholder);
    }
    $placeholder.show();
    window.player = new Playerjs({
      id: 'video-placeholder',
      file: videos
    });
  };

  /**
   * Shows the "Add video" button, styled the same as the "Watch video" button.
   * The button is placed immediately after the button with id "video-player-button".
   */
  function showAddVideoButton() {
    var $watchBtn = $('#video-player-button');
    var $addVideoButton = $('#add-video-button');
    if ($addVideoButton.length === 0) {
      // Assign the same class to the button as the "Watch video" one has
      $addVideoButton = $('<button id="add-video-button" class="video-btn">Add video</button>');
      // Insert it next to (after) the "Watch video" button
      $watchBtn.after($addVideoButton);
    } else {
      $addVideoButton.show();
    }
  }

  /**
   * Hides the "Add video" button.
   */
  function hideAddVideoButton() {
    $('#add-video-button').hide();
  }

  /**
   * Click handler for the "Watch" / "Close" button.
   * On click, it creates (or hides) the external player,
   * and also shows or hides the "Add video" button.
   */
  $(document).on('click', '#video-player-button', function(e) {
    e.preventDefault();
    var $button = $(this);
    var videosData = $button.attr('data-videos');
    // If there's no data in the button, you can try to find it in another element
    if (!videosData) {
      videosData = $('#editor').find('#video-player').attr('data-videos');
    }
    if (videosData) {
      try {
        var playerData = JSON.parse(videosData);
        if (playerData.videos && playerData.videos.length > 0) {
          if (!$('#video-placeholder').is(':visible')) {
            createExternalVideoPlayer(playerData.videos);
            $button.text('Close');
            showAddVideoButton();
          } else {
            $('#video-placeholder').hide();
            $button.text('Show video');
            hideAddVideoButton();
          }
        }
      } catch (err) {
        console.error("Error parsing player data:", err);
      }
    } else {
      alert("Player data not found in the project!");
    }
  });

  /**
   * Click handler for the "Add video" button.
   * Opens the file selection dialog.
   */
  $(document).on('click', '#add-video-button', function() {
    var videoInput = $('<input type="file" accept="video/*" multiple style="display:none" id="video-file">');
    $('body').append(videoInput);
    videoInput.click();
  });

  /**
   * If a separate button for video selection (with id="video") is also used,
   * it also opens the file selection dialog.
   */
  $('#video').click(function(){
    var videoInput = $('<input type="file" accept="video/*" multiple style="display:none" id="video-file">');
    $('body').append(videoInput);
    videoInput.click();
  });

  /**
   * File selection handler.
   * Uploads files to the server, updates the progress bar, and upon completion,
   * adds the new videos to the existing ones (if any).
   */
  $('body').on('change', '#video-file', function() {
    if (!window.currentProject) {
      alert("Select a project");
      return;
    }

    var files = this.files;
    if (!files || files.length === 0) return;

    var totalFiles = files.length;
    var uploadedCount = 0;
    var newVideos = []; // new video objects will be added here
    var allowedExtensions = ["mp4", "webm", "avi", "mov"];

    // Array to track the upload progress of each file (values from 0 to 1)
    var uploadProgress = new Array(totalFiles).fill(0);

    // Show and reset the progress bar
    $('#upload-progress').show();
    $('#progress-bar').css('width', '0%');

    // Function to update the overall progress
    function updateOverallProgress() {
      var totalProgress = uploadProgress.reduce(function(sum, value) {
        return sum + value;
      }, 0);
      var avgProgress = totalProgress / totalFiles;
      $('#progress-bar').css('width', (avgProgress * 100) + '%');
    }

    /**
     * After all files have finished uploading, update the player button.
     * If the button already exists, new videos are added to the existing ones.
     */
    function createVideoPlayerMarker(newVideos) {
      if (newVideos.length === 0) {
        alert("Failed to upload any files");
        $('#upload-progress').hide();
        return;
      }
      var $existingMarker = $('#editor').find('#video-player-button');
      var mergedVideos = [];
      if ($existingMarker.length === 0) {
        // If the button doesn't exist yet, create it with the new videos
        mergedVideos = newVideos;
        var playerData = { videos: mergedVideos };
        var jsonData = JSON.stringify(playerData);
        var buttonHtml = '<button id="video-player-button" data-videos=\'' + jsonData + '\' ' +
                         'contenteditable="false" class="video-btn">Watch</button>';
        $('#editor').append(buttonHtml);
      } else {
        // If the button already exists, merge the old and new videos
        var existingData = $existingMarker.attr('data-videos');
        try {
          var oldData = existingData ? JSON.parse(existingData) : {};
          if (oldData.videos && Array.isArray(oldData.videos)) {
            mergedVideos = oldData.videos.concat(newVideos);
          } else {
            mergedVideos = newVideos;
          }
        } catch (e) {
          console.error("Error parsing existing player data:", e);
          mergedVideos = newVideos;
        }
        var playerData = { videos: mergedVideos };
        var jsonData = JSON.stringify(playerData);
        $existingMarker.attr('data-videos', jsonData);
      }
      // Hide the progress bar upon completion
      $('#upload-progress').hide();
    }

    // Iterate over the selected files and upload them
    for (var i = 0; i < files.length; i++) {
      (function(file, index) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (allowedExtensions.indexOf(ext) === -1) {
          alert("Invalid file format: " + file.name);
          uploadedCount++;
          if (uploadedCount === totalFiles) {
            createVideoPlayerMarker(newVideos);
          }
          return;
        }
        var formData = new FormData();
        formData.append('project_name', window.currentProject);
        formData.append('file', file);
        $.ajax({
          url: '/upload_file',
          type: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          dataType: 'json',
          xhr: function() {
            var xhr = new window.XMLHttpRequest();
            // Update progress for each file
            xhr.upload.addEventListener("progress", function(evt) {
              if (evt.lengthComputable) {
                var percentComplete = evt.loaded / evt.total;
                uploadProgress[index] = percentComplete;
                updateOverallProgress();
              }
            }, false);
            return xhr;
          },
          success: function(data) {
            if (data.success) {
              var fileUrl = "/workspace/" + window.currentProject + "/" + data.filename;
              var fileTitle = data.filename.split('/').pop();
              newVideos.push({ title: fileTitle, file: fileUrl });
            } else {
              alert("Error uploading file " + file.name + ": " + data.error);
            }
          },
          error: function() {
            alert("Error uploading file " + file.name);
          },
          complete: function() {
            uploadedCount++;
            if (uploadedCount === totalFiles) {
              createVideoPlayerMarker(newVideos);
            }
          }
        });
      })(files[i], i);
    }
  });

});