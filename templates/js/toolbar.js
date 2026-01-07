$(document).ready(function(){
  // Populate the font size dropdown list from 8 to 150
  var $fontSizeSelect = $('#font-size');
  for (var i = 8; i <= 150; i++) {
    $fontSizeSelect.append($('<option>', {
      value: i,
      text: i
    }));
  }

  $('#text-align').change(function(){
    var align = $(this).val();
    if (align === 'left') {
      document.execCommand("justifyLeft", false, null);
    } else if (align === 'center') {
      document.execCommand("justifyCenter", false, null);
    } else if (align === 'right') {
      document.execCommand("justifyRight", false, null);
    }
  });

  // Text formatting (bold, italic, underline)
  $('.format-btn').click(function(){
    var command = $(this).data('command');
    document.execCommand(command, false, null);
  });

  // Change font
  $('#font-family').change(function(){
    var font = $(this).val();
    document.execCommand("fontName", false, font);
  });

  // Change font size via dropdown
  $('#font-size').change(function(){
    var size = $(this).val();
    var sel = window.getSelection();

    if (sel.rangeCount) {
      var range = sel.getRangeAt(0);
      // Create a span with the specified font size
      var span = document.createElement('span');
      span.style.fontSize = size + 'px';

      // If the selection is complex to wrap (e.g., contains multiple nodes), insert HTML
      try {
        range.surroundContents(span);
      } catch (e) {
        var selectedText = sel.toString();
        if (selectedText) {
          var html = "<span style='font-size:" + size + "px;'>" + selectedText + "</span>";
          document.execCommand("insertHTML", false, html);
        }
      }

      // Restore selection
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // Change font color
  $('#font-color').change(function(){
    var color = $(this).val();
    document.execCommand("foreColor", false, color);
  });

// Insert link
function insertLink() {
  var url = prompt("Enter the link URL:");
  if (url) {
    document.execCommand("createLink", false, url);
  }
}

$('#link-btn').click(function(){
  insertLink();
});

$(document).keydown(function(e) {
  if (e.ctrlKey && e.which === 73) { // Ctrl + I
    e.preventDefault();
    insertLink();
  }
});



  // Add quote
  $('#quote-btn').click(function(){
    document.execCommand("formatBlock", false, "blockquote");
  });

  // --- INSERT CODE BLOCK ---
  $('#clickable-text-btn').click(function(){
    var sel = window.getSelection();
    var selectedText = sel.toString();
    if(selectedText){
      var html = '<div class="clickable-text">' +
                   '<div class="copy-container" contenteditable="false">' +
                     '<button class="copy-icon" contenteditable="false">Copy 📋</button>' +
                   '</div>' +
                   '<pre class="code-content" contenteditable="true"><code>' + selectedText + '</code></pre>' +
                 '</div>';
      document.execCommand("insertHTML", false, html);
    }
  });

  // Click handler for the copy button inside a code block
  $(document).on('click', '.clickable-text .copy-icon', function(e){
    e.stopPropagation();
    // Find the text inside <code> in the nearest code block container
    var codeText = $(this).closest('.clickable-text').find('.code-content code').text();
    navigator.clipboard.writeText(codeText).then(function(){
      alert("Code copied:\n" + codeText);
    });
  });

  // --- UPDATE TOOLBAR STATE ---
  function updateToolbarState(){
    var sel = window.getSelection();
    if (sel.rangeCount) {
      var range = sel.getRangeAt(0);
      var node = range.startContainer;
      if(node.nodeType === 3) node = node.parentNode;
      var fontSize = window.getComputedStyle(node, null).getPropertyValue('font-size');
      if (fontSize){
        var size = parseInt(fontSize, 10);
        $('#font-size').val(size);
      }
      // You can also add alignment update if desired:
      // var textAlign = window.getComputedStyle(node, null).getPropertyValue('text-align');
      // if(textAlign){
      //   // Convert to left/center/right value for our select
      //   if(textAlign === 'start' || textAlign === 'left'){
      //     $('#text-align').val('left');
      //   } else if(textAlign === 'center'){
      //     $('#text-align').val('center');
      //   } else if(textAlign === 'end' || textAlign === 'right'){
      //     $('#text-align').val('right');
      //   }
      // }
    }
  }
  $('#editor').on('keyup mouseup', updateToolbarState);
});

  // --- New paragraph button ---
  $('#insert-empty-para-btn').click(function(){
    var editor = document.getElementById('editor');
    // Create an empty paragraph
    var newPara = document.createElement('p');
    newPara.innerHTML = '<br>';
    editor.appendChild(newPara);
    // Move the cursor to the created paragraph
    newPara.scrollIntoView();
    var range = document.createRange();
    range.selectNodeContents(newPara);
    range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });

$(document).on('click', '#editor a', function(e) {
    e.preventDefault();
    
    var $link = $(this);
    var href = $link.attr('href');

    // If a popup is already open for the same link, don't redraw
    if ($('#link-popup').length && $('#link-popup').data('href') === href) {
        return;
    }

    // Remove old popup
    $('#link-popup').remove();

    // Create popup
    var $popup = $('<div id="link-popup" style="position:absolute; background:#fff; border:1px solid #ccc; padding:5px; z-index:10000; box-shadow: 0 0 5px rgba(0,0,0,0.2);"></div>');
    $popup.append(`<span>Link: </span>`);
    var $gotoButton = $('<button type="button" style="margin-left:5px;">Go</button>');
    
    $gotoButton.on('click', function() {
        window.open(href, '_blank');
    });

    $popup.append($gotoButton);
    $('body').append($popup);

    // Save the link in data
    $popup.data('href', href);

    // Link coordinates
    var offset = $link.offset();
    var linkWidth = $link.outerWidth();
    var linkHeight = $link.outerHeight();
    var popupWidth = $popup.outerWidth();
    var popupHeight = $popup.outerHeight();

    // Determine the popup position considering window boundaries
    var topPos = offset.top - popupHeight - 5; // Above the link
    var leftPos = offset.left + linkWidth / 2 - popupWidth / 2; // Centered relative to the link

    // If the popup goes off the top boundary, place it below
    if (topPos < $(window).scrollTop()) {
        topPos = offset.top + linkHeight + 5;
    }

    // If the popup goes off the left boundary
    if (leftPos < 0) {
        leftPos = 5;
    }

    // If the popup goes off the right boundary
    if (leftPos + popupWidth > $(window).width()) {
        leftPos = $(window).width() - popupWidth - 5;
    }

    $popup.css({ top: topPos, left: leftPos });

    // Close the popup if clicked outside of it and the link
    $(document).on('click.linkPopup', function(event) {
        if (!$(event.target).closest('#link-popup, #editor a').length) {
            $('#link-popup').remove();
            $(document).off('click.linkPopup');
        }
    });
});