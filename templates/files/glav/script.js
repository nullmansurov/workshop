$(document).ready(function() {

  // Function to show toast notifications
  function showToast(message, duration) {
    duration = duration || 3000;
    var toast = $('<div class="toast-notification">' + message + '</div>');
    toast.css({
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 9999,
      display: 'none'
    });
    $('body').append(toast);
    toast.fadeIn(400).delay(duration).fadeOut(400, function(){
         $(this).remove();
    });
  }

$(document).ready(function() {

  // Function to show toast notifications
  function showToast(message, duration) {
    duration = duration || 3000;
    var toast = $('<div class="toast-notification">' + message + '</div>');
    toast.css({
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 9999,
      display: 'none'
    });
    $('body').append(toast);
    toast.fadeIn(400).delay(duration).fadeOut(400, function(){
         $(this).remove();
    });
  }

  // Button handler to open the modal window with anchors
  $('#list-iakor').click(function() {
    // Clear the anchor list in the modal window
    $('#anchor-list-modal').empty();

    // Collect all anchors in the editor
    $('span.anchor-text').each(function() {
        var anchorId = $(this).attr('id');
        var anchorText = $(this).text();

        // Add each anchor to the modal window list
        var anchorItem = $('<li></li>')
            .append('<a href="#" class="anchor-link" data-id="' + anchorId + '">' + anchorText + '</a>')
            .append('<button class="delete-anchor-btn" data-id="' + anchorId + '">delete</button>');
        $('#anchor-list-modal').append(anchorItem);
    });

    // Show the modal window
    $('#anchor-modal').modal('show');
  });

  // Anchor addition handler
  $('#iakor').click(function() {
    var sel = window.getSelection();
    var selectedText = sel.toString();
    
    if (selectedText) {
        // Generate a unique ID for the anchor
        var anchorId = 'anchor-' + new Date().getTime();
        
        // Create a new span element with the anchor
        var anchorElement = $('<span>', {
            id: anchorId,
            class: 'anchor-text',
            html: selectedText
        });

        // Insert the element into the editor, preserving styles
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(anchorElement[0]);

        // Add the anchor to the modal window list
        addAnchorToList(anchorId, selectedText);

        // Show a notification that the anchor has been added
        showToast('Anchor "' + selectedText + '" added!', 3000);
    }
  });

  // Function to add an anchor to the modal window list
  function addAnchorToList(id, text) {
    var anchorList = $('#anchor-list-modal');
    var anchorItem = $('<li></li>')
        .append('<a href="#" class="anchor-link" data-id="' + id + '">' + text + '</a>')
        .append('<button class="delete-anchor-btn" data-id="' + id + '">Delete</button>');
    anchorList.append(anchorItem);
  }

  // Smooth scroll to anchor
  $(document).on('click', '.anchor-link', function(e) {
    e.preventDefault();
    var anchorId = $(this).data('id');
    var anchorElement = document.getElementById(anchorId);
    
    if (anchorElement) {
      anchorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Visually highlight the anchor for 1 second
      $(anchorElement).css({ backgroundColor: '#ffff99' });
      setTimeout(() => {
        $(anchorElement).css({ backgroundColor: '' });
      }, 1000);
    }
  });

  // Anchor deletion handler (removes only the wrapper, leaving the text)
  $(document).on('click', '.delete-anchor-btn', function() {
    var anchorId = $(this).data('id');

    // Remove the anchor wrapper, leaving the text untouched
    $('#' + anchorId).contents().unwrap();

    // Remove the anchor from the modal window list
    $(this).parent().remove();

    // Show a deletion notification
    showToast('Anchor deleted', 3000);
  });

  // Handler for the close button of the modal window with a unique ID
  $('#anchor-modal-close').click(function() {
    $('#anchor-modal').modal('hide');
  });

  // Clear the anchor list when the modal window is closed
  $('#anchor-modal').on('hidden.bs.modal', function() {
    $('#anchor-list-modal').empty();
  });

  // Adding hotkeys Ctrl + Y and Ctrl + U
  $(document).keydown(function(e) {
    if (e.ctrlKey) {
      if (e.which === 89) { // Ctrl + Y
        e.preventDefault();
        $('#list-iakor').click();
      }
      if (e.which === 85) { // Ctrl + U
        e.preventDefault();
        $('#iakor').click();
      }
    }
  });

});


  // Function to add an anchor to the modal window list
  function addAnchorToList(id, text) {
    var anchorList = $('#anchor-list-modal');
    var anchorItem = $('<li></li>')
        .append('<a href="#" class="anchor-link" data-id="' + id + '">' + text + '</a>')
        .append('<button class="delete-anchor-btn" data-id="' + id + '">Delete</button>');
    anchorList.append(anchorItem);
  }

  // Smooth scroll to anchor
  $(document).on('click', '.anchor-link', function(e) {
    e.preventDefault();
    var anchorId = $(this).data('id');
    var anchorElement = document.getElementById(anchorId);
    
    if (anchorElement) {
      anchorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Visually highlight the anchor for 1 second
      $(anchorElement).css({ backgroundColor: '#ffff99' });
      setTimeout(() => {
        $(anchorElement).css({ backgroundColor: '' });
      }, 1000);
    }
  });

  // Anchor deletion handler (removes only the wrapper, leaving the text)
  $(document).on('click', '.delete-anchor-btn', function() {
    var anchorId = $(this).data('id');

    // Remove the anchor wrapper, leaving the text untouched
    $('#' + anchorId).contents().unwrap();

    // Remove the anchor from the modal window list
    $(this).parent().remove();

    // Show a deletion notification
    showToast('Anchor deleted', 3000);
  });

  // Handler for the close button of the modal window with a unique ID
  $('#anchor-modal-close').click(function() {
    $('#anchor-modal').modal('hide');
  });

  // Clear the anchor list when the modal window is closed
  $('#anchor-modal').on('hidden.bs.modal', function() {
    $('#anchor-list-modal').empty();
  });

});