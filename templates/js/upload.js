/* Upload.js */

$(document).ready(function() {
  var savedRange = null;
  var editorEl = $('#editor')[0];

  // Check if the node is inside the editor
  function isInEditor(node) {
    return editorEl.contains(node);
  }

  // Save the last cursor position in the editor
  function saveRange() {
    var sel = window.getSelection();
    if (sel.rangeCount) {
      var range = sel.getRangeAt(0);
      if (isInEditor(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
      }
    }
  }

  // Listen for events to update savedRange
  editorEl.addEventListener('keyup', saveRange);
  editorEl.addEventListener('mouseup', saveRange);
  editorEl.addEventListener('focus', saveRange);

  // Insert HTML at the cursor position inside the editor
  function insertAtCursor(html) {
    var sel = window.getSelection();
    var range;

    // If the current cursor is in the editor - use it
    if (sel.rangeCount && isInEditor(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
    }
    // Otherwise, if there is a saved range - restore it
    else if (savedRange) {
      range = savedRange.cloneRange();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // Otherwise, focus the editor and insert at the end
    else {
      $('#editor').focus();
      range = document.createRange();
      range.selectNodeContents(editorEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Insert the content
    range.deleteContents();
    var el = document.createElement("div");
    el.innerHTML = html;
    var frag = document.createDocumentFragment(), node, lastNode;
    while ((node = el.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    range.insertNode(frag);

    // Move the cursor after the inserted element
    if (lastNode) {
      range = range.cloneRange();
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Update savedRange
    savedRange = range.cloneRange();
  }

  // Template for the audio player
  function buildAudioTag(fileUrl, ids) {
    return `
      <br>
      <div class="custom-audio-player" contenteditable="false" data-audio-src="${fileUrl}">
        <audio id="${ids.audioId}" src="${fileUrl}" 
               ontimeupdate="updateProgress('${ids.audioId}', '${ids.progressBarId}', '${ids.currentTimeId}')">
        </audio>
        <button class="play-btn"   onclick="playAudio('${ids.audioId}')">play</button>
        <button class="pause-btn"  onclick="pauseAudio('${ids.audioId}')">pause</button>
        <button class="stop-btn"   onclick="stopAudio('${ids.audioId}', '${ids.progressBarId}', '${ids.currentTimeId}')">stop</button>

        <div class="progress-container">
          <div class="progress-bar" id="${ids.progressBarId}"></div>
        </div>
        <span class="time" id="${ids.durationId}">0:00</span>
      </div>
      <br>
    `;
  }

  window.uploadFile = function(formData) {
    var progressBar = $('#upload-progress .progress-bar');
    $('#upload-progress').show();
    $.ajax({
      xhr: function() {
        var xhr = new window.XMLHttpRequest();
        xhr.upload.addEventListener("progress", function(evt) {
          if (evt.lengthComputable) {
            var percentComplete = evt.loaded / evt.total * 100;
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
        $('#upload-progress').fadeOut(500, function(){ progressBar.css('width','0%'); });
        if(data.success) {
          var ext = data.filename.split('.').pop().toLowerCase();
          var fileUrl = "/workspace/" + window.currentProject + "/" + data.filename;
          var tag = "";

          if (["mp3", "wav", "ogg"].indexOf(ext) >= 0) {
            var idx = $('#editor').find('audio').length;
            var ids = {
              audioId:      'audio' + idx,
              progressBarId:'progress-bar' + idx,
              currentTimeId:'current-time' + idx,
              durationId:   'duration' + idx
            };

            tag = buildAudioTag(fileUrl, ids);
            insertAtCursor(tag);
            var audioEl = document.getElementById(ids.audioId);
            audioEl.onloadedmetadata = function() {
              document.getElementById(ids.durationId).textContent = formatTime(audioEl.duration);
            };

          } else if (["jpg","jpeg","png","gif"].indexOf(ext) >= 0) {
            tag = "<br><img src='" + fileUrl + "' style='max-width:100%; display:block; margin:10px auto;' class='resizable draggable'><br>";
            insertAtCursor(tag);

          } else if (["mp4","webm","avi","mov"].indexOf(ext) >= 0) {
            tag = "<br><video controls style='max-width:100%; display:block; margin:10px auto;'>" +
                  "<source src='" + fileUrl + "' type='video/" + ext + "'>" +
                  "Your browser does not support the video tag." +
                  "</video><br>";
            insertAtCursor(tag);

          } else {
            tag = "<br><a href='" + fileUrl + "' target='_blank'>" + data.filename + "</a><br>";
            insertAtCursor(tag);
          }
        } else {
          alert(data.error);
        }
      }
    });
  };

  $('#upload-btn').click(function(){
    $('#upload-file').attr('accept', 'image/*,video/*,audio/*');
    $('#upload-file').click();
  });

  $('#upload-file').attr('multiple', 'multiple');

  $('#upload-file').change(function() {
    if (!window.currentProject) {
      alert("Select a project");
      return;
    }

    var files = this.files;
    var allowedExtensions = ["mp3","wav","ogg","jpg","jpeg","png","gif","mp4","webm","avi","mov"];

    Array.from(files).forEach(function(file) {
      var ext = file.name.split('.').pop().toLowerCase();
      if (allowedExtensions.indexOf(ext) === -1) {
        alert("Invalid file format: " + file.name);
        return;
      }

      var formData = new FormData();
      formData.append('project_name', window.currentProject);
      formData.append('file', file);
      uploadFile(formData);
    });
  });

  window.resetAudioPlayer = function() {
    if (window.currentPlayingAudio) {
      window.currentPlayingAudio.pause();
      window.currentPlayingAudio.currentTime = 0;
      window.currentPlayingAudio = null;
      window.currentAudioUrl = null;
      document.querySelector('.floating-audio-controls').style.display = 'none';
    }
  };

  function formatTime(seconds) {
    var minutes = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
  }

  // Function to clean color/background-color styles from HTML
  function sanitizeHtml(html) {
    // create a temporary container
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    // recursively traverse all elements
    tmp.querySelectorAll('*').forEach(function(el) {
      // if there is an inline style, remove the color and background-color properties
      if (el.hasAttribute('style')) {
        var style = el.getAttribute('style')
                       .replace(/(?:^|;)\s*color\s*:\s*[^;]+;?/gi, '')
                       .replace(/(?:^|;)\s*background-color\s*:\s*[^;]+;?/gi, '')
                       .trim();
        if (style) el.setAttribute('style', style);
        else el.removeAttribute('style');
      }
    });
    return tmp.innerHTML;
  }

// Paste handler
$('#editor').on('paste', function(e) {

  if ($(e.target).is('.gemini-input')) {
    return; 
  }

  var clipboard = e.originalEvent.clipboardData;
  if (!clipboard) return; 
  
  if (clipboard.files && clipboard.files.length > 0) {
    e.preventDefault();
    alert("⛔ Pasting files from the clipboard is forbidden.\nPlease use the 'Upload File' button.");
    return;
  }

  // HTML text
  var htmlData = clipboard.getData('text/html');
  var textData = clipboard.getData('text/plain');
  if (htmlData) {
    e.preventDefault();
    // clean color/background styles
    var clean = sanitizeHtml(htmlData);
    insertAtCursor(clean);
  } else if (textData) {
    // if only plain text, insert it as is
    // (you can also wrap with <p>…</p> here if desired)
    e.preventDefault();
    insertAtCursor(textData.replace(/\n/g, '<br>'));
  }
});

});

function generateUniqueFileName() {
  return 'recording_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.ogg';
}

var mediaRecorder = null;
var audioChunks = [];
$('#record-btn').click(function(){
  if (!mediaRecorder) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function(stream) {
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = function(e){ audioChunks.push(e.data); };
        mediaRecorder.onstop = function(){
          var audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
          var fd = new FormData();
          fd.append('project_name', window.currentProject);

          var fname = generateUniqueFileName();
          fd.append('file', audioBlob, fname);

          uploadFile(fd);
          stream.getTracks().forEach(track => track.stop());
          mediaRecorder = null;
          $('#record-btn').text("Record Audio");
        };
        mediaRecorder.start();
        $('#record-btn').text("Stop Recording Audio");
      })
      .catch(function(err){
        console.error("Microphone access error:", err);
        alert("No microphone access");
      });
  } else {
    mediaRecorder.stop();
  }
});