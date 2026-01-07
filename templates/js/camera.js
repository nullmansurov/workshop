$(document).ready(function () {
  let currentFacing = "user"; // Default to front camera
  let currentStream = null;
  let video = document.getElementById("video-preview");

  function stopCurrentStream() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
  }

  function startCamera(facingMode) {
    stopCurrentStream();

    let constraints = { video: { facingMode: facingMode } };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(function (stream) {
        currentStream = stream;
        video.srcObject = stream;
        currentFacing = facingMode;

        // Check if the rear camera is available
        navigator.mediaDevices.enumerateDevices().then(devices => {
          let videoDevices = devices.filter(device => device.kind === "videoinput");
          if (videoDevices.length > 1) {
            $("#flip-camera-btn").show();
          } else {
            $("#flip-camera-btn").hide();
          }
        });
      })
      .catch(function (err) {
        console.error("Error accessing camera: ", err);
        alert("No camera access");
      });
  }

  // Open camera
  $("#photo-btn").click(function () {
    if (!window.currentProject) {
      alert("Select a project");
      return;
    }
    $("#camera-modal").fadeIn(200);
    startCamera("user");
  });

  // Switch camera
  $("#flip-camera-btn").click(function () {
    let newFacing = currentFacing === "user" ? "environment" : "user";
    startCamera(newFacing);
  });


  // Generate a unique name for the file
  function generateUniqueFileName() {
    return 'recording_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.png';
  }


  // Capture snapshot
  $("#capture-btn").click(function () {
    let canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(function (blob) {
      if (confirm("Upload this snapshot?")) {
        let fd = new FormData();
        fd.append("project_name", window.currentProject);

        var uniqueFileName = generateUniqueFileName();
        fd.append("file", blob, uniqueFileName);

        // Use the global uploadFile function (defined in upload.js)
        uploadFile(fd);
      }
    }, "image/png");

    stopCurrentStream();
    $("#camera-modal").fadeOut(200);
  });

  // Cancel capture
  $("#cancel-capture-btn").click(function () {
    stopCurrentStream();
    $("#camera-modal").fadeOut(200);
  });
});