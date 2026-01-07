$(document).ready(function() {
  // -- [Core Utility Functions - Preserved & Unchanged] --

  // Function to escape HTML to prevent XSS attacks.
  function escapeHtml(text) {
    return $('<div>').text(text).html();
  }

  // Converts simple markdown like **bold** and *italic* to HTML.
  function formatGeminiResponse(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    var paragraphs = text.split(/\n\s*\n/);
    for (var i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].trim() !== '') {
        paragraphs[i] = '<p>' + paragraphs[i].replace(/\n/g, '<br>') + '</p>';
      }
    }
    return paragraphs.join('');
  }

  // Creates a container for the Gemini dialog.
  function createGeminiContainer() {
    var container = document.createElement('div');
    container.className = 'gemini-container';
    container.setAttribute('contenteditable', 'false');

    var answerDiv = document.createElement('div');
    answerDiv.className = 'gemini-answer';
    container.appendChild(answerDiv);

    var followupDiv = document.createElement('div');
    followupDiv.className = 'gemini-followup';

    var inputField = document.createElement('textarea');
    inputField.className = 'gemini-input';
    inputField.placeholder = 'Type question';
    inputField.rows = 1;

    var sendButton = document.createElement('button');
    sendButton.className = 'gemini-send';
    sendButton.innerText = 'Send';

    followupDiv.appendChild(inputField);
    followupDiv.appendChild(sendButton);
    container.appendChild(followupDiv);

    $(inputField).on('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    return container;
  }

  // Observer to remove the entire Gemini container if its content is deleted by the user.
  function observeContainerRemoval(container) {
    var target = $(container).find('.gemini-answer')[0];
    var observer = new MutationObserver(function(mutations) {
      if ($(target).text().trim() === '' && $(target).children().length === 0) {
        $(container).remove();
        observer.disconnect();
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  // -- [NEW - Global Context Gathering] --
  
  /**
   * Scans the #editor for all Gemini dialogs and builds a full conversational history.
   * This allows Gemini to have context of previous, separate conversations.
   * @returns {string} A formatted string of the entire conversation history.
   */
  function gatherFullContext() {
      let fullContext = [];
      $('#editor .gemini-container').each(function() {
          const $container = $(this);
          let dialogContext = [];

          // Get the initial system prompt from metadata
          const assistantPrompt = $container.data('assistant-prompt');
          if (assistantPrompt) {
              dialogContext.push("SYSTEM PROMPT: " + assistantPrompt);
          }

          // Extract all user messages and assistant responses in order
          $container.find('.gemini-answer > div').each(function() {
              if ($(this).hasClass('gemini-user-message')) {
                  dialogContext.push("User: " + $(this).text().trim());
              } else if ($(this).hasClass('gemini-answer-item')) {
                  dialogContext.push("Assistant: " + $(this).text().trim());
              }
          });
          
          if (dialogContext.length > 0) {
            fullContext.push(dialogContext.join('\n'));
          }
      });
      
      if (fullContext.length > 0) {
        // Return a clearly delineated history block
        return "---PREVIOUS DIALOGS ON PAGE---\n" + fullContext.join('\n\n---\n\n') + "\n---END OF PREVIOUS DIALOGS---\n\n";
      }
      return "";
  }


  // -- [Improved Interaction Logic] --

  function processFollowupQuery(container) {
    var inputField = $(container).find('.gemini-input');
    var query = inputField.val().trim();
    if (!query) return;

    inputField.prop('disabled', true);
    $(container).find('.gemini-send').prop('disabled', true);

    var $answerDiv = $(container).find('.gemini-answer');
    $answerDiv.append('<div class="gemini-user-message"><p>' + escapeHtml(query) + '</p></div>');
    var waitingMessage = $('<p class="gemini-waiting">Waiting for a response from Gemini...</p>');
    $answerDiv.append(waitingMessage);

    // [MODIFIED] Get GLOBAL context first, then add local context
    var fullPageContext = gatherFullContext();
    var contextClone = $answerDiv.clone();
    contextClone.find('.gemini-waiting, .gemini-assistant-name-display').remove();
    var previousContext = contextClone.text();
    
    // Combine contexts. Full page history comes first.
    var combinedMessage = fullPageContext + "---CURRENT CONVERSATION CONTEXT---\n" + previousContext + "\n\n---CURRENT QUERY---\n" + query;

    $.ajax({
      url: '/gemini_api',
      type: 'POST',
      data: { text: combinedMessage },
      success: function(response) {
        waitingMessage.remove();
        if (response.success) {
          var formatted = formatGeminiResponse(response.response);
          $answerDiv.append('<div class="gemini-answer-item">' + formatted + '</div>');
        } else {
          $answerDiv.append('<p class="gemini-error">Gemini error: ' + escapeHtml(response.error) + '</p>');
        }
      },
      error: function(xhr, status, error) {
        waitingMessage.remove();
        $answerDiv.append('<p class="gemini-error">Server error: ' + escapeHtml(error) + '</p>');
      },
      complete: function() {
        inputField.prop('disabled', false).val('');
        $(container).find('.gemini-send').prop('disabled', false);
        inputField.css('height', 'auto').focus();
      }
    });
  }

  function processGeminiQuery(queryText, assistantPrompt, assistantName) {
    if (!queryText) {
      alert("No text selected.");
      return;
    }
    
    // [MODIFIED] Gather context from all existing dialogs on the page
    var pageContext = gatherFullContext();
    var finalQuery = pageContext + (assistantPrompt ? assistantPrompt + "\n\n" + queryText : queryText);
    
    var newContainer = createGeminiContainer();

    if (assistantPrompt) {
      $(newContainer).data('assistant-prompt', assistantPrompt);
    }

    if (selectedGeminiRange) {
      var range = selectedGeminiRange;
      range.collapse(false);
      range.insertNode(newContainer);
      newContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      $('body').append(newContainer);
    }

    var $answerDiv = $(newContainer).find('.gemini-answer');
    $answerDiv.empty();
    
    // [MODIFIED] Display only the assistant's name, not the prompt. The prompt is in metadata.
    if (assistantName) {
        $answerDiv.append('<div class="gemini-assistant-name-display"><p><strong>Assistant:</strong> ' + escapeHtml(assistantName) + '</p></div>');
    }

    $answerDiv.append('<div class="gemini-user-message"><p>' + escapeHtml(queryText) + '</p></div>');
    var waitingMessage = $('<p class="gemini-waiting">Waiting for a response from Gemini...</p>');
    $answerDiv.append(waitingMessage);

    $.ajax({
      url: '/gemini_api',
      type: 'POST',
      data: { text: finalQuery }, // Send query with full page context
      success: function(response) {
        waitingMessage.remove();
        if (response.success) {
          var formatted = formatGeminiResponse(response.response);
          $answerDiv.append('<div class="gemini-answer-item">' + formatted + '</div>');
        } else {
          $answerDiv.append('<p class="gemini-error">Gemini error: ' + escapeHtml(response.error) + '</p>');
        }
      },
      error: function(xhr, status, error) {
        waitingMessage.remove();
        $answerDiv.append('<p class="gemini-error">Server error: ' + escapeHtml(error) + '</p>');
      }
    });
    observeContainerRemoval(newContainer);
  }

  // -- [Context Menu and Assistant Management - MODIFIED] --
  var selectedGeminiText = "";
  var selectedGeminiRange = null;

  function getOrCreateGeminiContextMenu() {
    var $menu = $('#gemini-context-menu');
    if ($menu.length === 0) {
      $menu = $('<div id="gemini-context-menu" class="gemini-context-menu"></div>');
      $menu.append('<button id="gemini-context-normal" class="gemini-context-menu-btn">Normal Request</button>')
        .append('<button id="gemini-context-copy" class="gemini-context-menu-btn">Copy</button>')
        .append('<button id="gemini-context-import" class="gemini-context-menu-btn">Import Assistant from JSON</button>')
        .append('<hr class="gemini-menu-divider">')
        .append('<div class="gemini-menu-header">Assistants</div>')
        .append('<div id="gemini-context-assistants-list" class="gemini-context-assistants-list"></div>')
        .append('<hr class="gemini-menu-divider">')
        .append('<button id="gemini-context-add-assistant" class="gemini-context-menu-btn">Add New Assistant</button>');
      $('body').append($menu);
    }
    return $menu;
  }
  
  // [MODIFIED] The dropdown is now created dynamically outside the main context menu.
  function showAssistantActionsMenu(buttonElement, assistant, index) {
    hideAssistantActionsMenu(); // Hide any existing menu
    
    var $button = $(buttonElement);
    var assistants = JSON.parse(localStorage.getItem('gemini_assistants') || '[]');
    
    // Create the dropdown menu
    var $dropdown = $('<div class="gemini-assistant-dropdown"></div>');

    $dropdown.append($('<button>Edit</button>').click(function() {
      var newName = prompt("Enter new assistant name:", assistant.name);
      if (newName === null) return;
      var newPrompt = prompt("Enter new prompt:", assistant.prompt);
      if (newPrompt === null) return;
      assistants[index] = { name: newName, prompt: newPrompt };
      localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
      hideAssistantActionsMenu();
      updateAssistantList(); // Refresh list in the main context menu
    }));

    $dropdown.append($('<button>Delete</button>').click(function() {
      if (confirm("Are you sure you want to delete assistant '" + assistant.name + "'?")) {
        assistants.splice(index, 1);
        localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
        hideAssistantActionsMenu();
        updateAssistantList();
      }
    }));

    $dropdown.append($('<button>Download</button>').click(function() {
        var filename = 'assistant_' + assistant.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
        var blob = new Blob([JSON.stringify(assistant, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        hideContextMenu(); // Hides both menus
    }));

    // Position and show the menu
    var backdrop = $('<div class="gemini-menu-backdrop"></div>').appendTo('body');
    backdrop.on('click.hideMenu', function(e) {
      e.stopPropagation();
      hideAssistantActionsMenu();
    });

    $('body').append($dropdown);
    var btnOffset = $button.offset();
    $dropdown.css({
        position: 'absolute',
        top: btnOffset.top + $button.outerHeight(),
        left: btnOffset.left,
        display: 'block'
    });
  }

  function hideAssistantActionsMenu() {
    $('.gemini-assistant-dropdown').remove();
    $('.gemini-menu-backdrop').remove();
  }

  function updateAssistantList() {
    var $list = $('#gemini-context-assistants-list');
    $list.empty();
    var assistants = JSON.parse(localStorage.getItem('gemini_assistants') || '[]');
    assistants.forEach(function(assistant, index) {
      var $item = $('<div class="gemini-context-assistant-item"></div>');
      var $name = $('<span class="gemini-assistant-name">' + escapeHtml(assistant.name) + '</span>');
      var $moreBtn = $('<button class="gemini-assistant-more-btn">⋮</button>');

      $name.click(function() {
        hideContextMenu();
        processGeminiQuery(selectedGeminiText, assistant.prompt, assistant.name);
      });
      
      $moreBtn.click(function(e) {
        e.stopPropagation(); // Prevent main context menu from closing
        showAssistantActionsMenu(this, assistant, index);
      });

      $item.append($name).append($moreBtn);
      $list.append($item);
    });
  }

  function hideContextMenu() {
    $('#gemini-context-menu').hide();
    hideAssistantActionsMenu();
  }

  // -- [Event Handlers] --
  
  $(document).on('contextmenu', function(e) {
    var selection = window.getSelection();
    var text = selection.toString().trim();
    if (text && $(e.target).closest('.gemini-container').length === 0) {
      e.preventDefault();
      hideContextMenu(); // Hide any menus currently open
      selectedGeminiText = text;
      selectedGeminiRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

      var $menu = getOrCreateGeminiContextMenu();
      updateAssistantList();
      
      var menuWidth = $menu.outerWidth();
      var menuHeight = $menu.outerHeight();
      var winWidth = $(window).width();
      var winHeight = $(window).height();
      
      var top = e.pageY;
      var left = e.pageX;

      if (e.pageX + menuWidth + 10 > winWidth) left = e.pageX - menuWidth;
      if (e.pageY + menuHeight + 10 > winHeight) top = e.pageY - menuHeight;
      
      $menu.css({ top: top + 'px', left: left + 'px' }).show();
    } else {
      // Allow default context menu if no text is selected
      hideContextMenu();
    }
  });

  $(document).on('click', function(e) {
    // Hide main menu if click is outside of it. Action menu has its own backdrop.
    if (!$(e.target).closest('#gemini-context-menu').length) {
      hideContextMenu();
    }
  });
  
  // Context Menu button handlers
  $(document).on('click', '#gemini-context-normal', function() {
    hideContextMenu();
    processGeminiQuery(selectedGeminiText, null, null);
  });
  
  $(document).on('click', '#gemini-context-copy', function() {
    hideContextMenu();
    navigator.clipboard.writeText(selectedGeminiText)
      .then(() => console.log("Text copied."))
      .catch(err => console.error("Error copying text: ", err));
  });
  
  $(document).on('click', '#gemini-context-add-assistant', function() {
    // The menu is closed implicitly when the prompt opens.
    var name = prompt("Enter new assistant name:");
    if (!name) return;
    var promptText = prompt("Enter system prompt for the assistant:");
    if (promptText === null) return;
    var assistants = JSON.parse(localStorage.getItem('gemini_assistants') || '[]');
    assistants.push({ name: name, prompt: promptText });
    localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
    updateAssistantList();
  });
  
  $(document).on('click', '#gemini-context-import', function() {
    hideContextMenu();
    var fileInput = $('<input type="file" accept=".json,application/json">').get(0);
    fileInput.onchange = function(event) {
      var file = event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var assistant = JSON.parse(e.target.result);
          if (assistant.name && typeof assistant.prompt !== 'undefined') {
            var assistants = JSON.parse(localStorage.getItem('gemini_assistants') || '[]');
            assistants.push({ name: assistant.name, prompt: assistant.prompt });
            localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
            alert("Assistant '" + escapeHtml(assistant.name) + "' imported successfully!");
            // No need to update list as the context menu is already hidden
          } else {
            alert("Import failed: JSON file must contain 'name' and 'prompt' properties.");
          }
        } catch (err) {
          alert("Import failed: Could not parse the JSON file. " + err.message);
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  });

  // [Original Functionality Preserved]
  $('#gemini').click(function() {
    var token = prompt("Enter Gemini token:");
    if (!token) {
      alert("Token not entered.");
      return;
    }
    $.ajax({
      url: '/gemini_token',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ token: token }),
      success: function(response) {
        if (response.success) {
          alert("Token saved successfully.");
        } else {
          alert("Error: " + (response.error || "Failed to save token."));
        }
      },
      error: function(xhr) {
        alert("Error while saving token: " + xhr.responseText);
      }
    });
  });

  // Event handlers for the follow-up chat interface.
  $(document).on('click', '.gemini-send', function() {
    processFollowupQuery($(this).closest('.gemini-container'));
  });

  $(document).on('keydown', '.gemini-input', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      processFollowupQuery($(this).closest('.gemini-container'));
    }
  });
});