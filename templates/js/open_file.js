(function($) {
  $(document).ready(function() {
    /**
     * Handler for the "Open" button inside the editor.
     * On click, a URL is formed to download the file and the download is initiated.
     */
    $('#editor').on('click', '.open-file-btn', function() {
      // Get the filename from the data-attribute of the parent container
      var container = $(this).closest('.file-container');
      var filename = container.attr('data-filename');
      
      // Form the URL to download the file, passing project_name and file_name as GET parameters
      var downloadUrl = '/download_file?project_name=' 
                        + encodeURIComponent(window.currentProject)
                        + '&file_name=' + encodeURIComponent(filename);
      
      // Create a temporary link and initiate a click on it to download the file
      var link = document.createElement('a');
      link.href = downloadUrl;
      // The download attribute helps to set the filename (the browser may ignore it if the server sets Content-Disposition)
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    /**
     * Function to upload a file, creating a container in the editor.
     * Used ONLY when attaching a file via the #filepath button.
     */
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
          $('#upload-progress').fadeOut(500, function(){ progressBar.css('width', '0%'); });
          if (data.success) {
            // Create a container for the attached file
            var container = $('<div class="file-container" contenteditable="false"></div>');
            // Write the filename to the data-attribute for later use when downloading
            container.attr('data-filename', data.filename);
            
            // File icon (universal, the path can be changed if necessary)
            var icon = $('<img class="file-icon">').attr('src', '/js/file.png');
            container.append(icon);
            
            // File name
            var fileNameSpan = $('<span class="file-name"></span>').text(data.filename);
            container.append(fileNameSpan);
            
            // "Open" button
            var openButton = $('<button class="open-file-btn">Download</button>');
            container.append(openButton);
            
            // Add the container to the editor
            $('#editor').append(container);
          } else {
            alert("File upload error: " + data.error);
          }
        },
        error: function(err) {
          $('#upload-progress').fadeOut(500, function(){ progressBar.css('width', '0%'); });
          alert("Request error: " + err.responseText);
        }
      });
    }

    /**
     * Handler for the "Attach File" button.
     * Creates a temporary input for file selection and calls uploadFileAttachment for each selected file.
     */
    $('#filepath').on('click', function() {
      // Create a temporary input for file selection
      var fileInput = $('<input type="file" style="display: none;">');
      fileInput.attr('multiple', 'multiple');
      $('body').append(fileInput);
      
      fileInput.on('change', function(e) {
        // Check if a project is selected
        if (!window.currentProject) {
          alert("Select a project");
          fileInput.remove();
          return;
        }
        
        var files = e.target.files;
        Array.from(files).forEach(function(file) {
          var formData = new FormData();
          formData.append('project_name', window.currentProject);
          formData.append('file', file);
          // Upload the file and create a container in the editor on success
          uploadFileAttachment(formData);
        });
        fileInput.remove();
      });
      
      // Programmatically trigger the file selection dialog
      fileInput.trigger('click');
    });

  });
})(jQuery);