// open_file.js

(function($) {
  $(document).ready(function() {
    // Get the shareId from the URL and save it globally
    const shareId = window.location.pathname.split("/").pop();
    window.shareId = shareId;

    // Select the container for delegating clicks:
    // if #editor exists (editable page) - use it,
    // otherwise - general view in .project-content
    const fileRoot = $('#editor').length ? $('#editor') : $('.project-content');

    /**
     * Handler for the "Download" button inside the specified container.
     * When clicked, a URL for downloading the file is formed and the download is initiated.
     */
    fileRoot.on('click', '.open-file-btn', function() {
      var container = $(this).closest('.file-container');
      var filename  = container.attr('data-filename');
      if (!filename) {
        console.error('data-filename not found on the container');
        return;
      }

      // Form the URL for downloading, pass share_id and file_name
      var downloadUrl = '/download_file?share_id='
                        + encodeURIComponent(window.shareId)
                        + '&file_name=' + encodeURIComponent(filename);

      // Create a temporary link and click on it
      var link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // --- File upload block for the editable page ---
    // If the #filepath button exists on the page — connect the upload logic
    if ($('#filepath').length) {

      function uploadFileAttachment(formData) {
        var progressBar = $('#upload-progress .progress-bar');
        $('#upload-progress').show();

        $.ajax({
          xhr: function() {
            var xhr = new window.XMLHttpRequest();
            xhr.upload.addEventListener("progress", function(evt) {
              if (evt.lengthComputable) {
                var percentComplete = (evt.loaded / evt.total) * 100;
                progressBar.css('width', percentComplete + '%');
              }
            }, false);
            return xhr;
          },
          url: '/upload_file',
          type: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          success: function(data) {
            $('#upload-progress').fadeOut(500, function(){
              progressBar.css('width', '0%');
            });
            if (data.success) {
              var container = $('<div class="file-container" contenteditable="false"></div>')
                .attr('data-filename', data.filename);

              // The icon is now loaded from the site root
              container.append(
                $('<img class="file-icon">').attr('src', '/js/file.png')
              );
              
              container.append(
                $('<span class="file-name"></span>').text(data.filename)
              );
              container.append(
                $('<button class="open-file-btn">Download</button>')
              );
              $('#editor').append(container);
            } else {
              alert("File upload error: " + data.error);
            }
          },
          error: function(err) {
            $('#upload-progress').fadeOut(500, function(){
              progressBar.css('width', '0%');
            });
            alert("Request error: " + err.responseText);
          }
        });
      }

      $('#filepath').on('click', function() {
        var fileInput = $('<input type="file" style="display:none;" multiple>');
        $('body').append(fileInput);

        fileInput.on('change', function(e) {
          if (!window.shareId) {
            alert("Could not determine the project to upload the file to");
            fileInput.remove();
            return;
          }
          Array.from(e.target.files).forEach(function(file) {
            var formData = new FormData();
            formData.append('share_id', window.shareId);
            formData.append('file', file);
            uploadFileAttachment(formData);
          });
          fileInput.remove();
        });

        fileInput.trigger('click');
      });
    }
  });
})(jQuery);