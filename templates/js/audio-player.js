// Переменные для отслеживания активного плеера и плейлиста
window.playlist = [];
window.currentIndex = -1;
window.isLoop = false;
window.currentPlayingAudio = null;
window.currentPlayingContainer = null;
window.currentAudioUrl = null;
window.floatingControlsOriginalHtml = null;

$(document).ready(function() {
  // Сбор всех аудио в плейлист
  function updatePlaylist() {
    window.playlist = $('.custom-audio-player audio').map(function() { return this; }).get();
    if (window.currentPlayingAudio) {
      window.currentIndex = window.playlist.indexOf(window.currentPlayingAudio);
    }
  }
  updatePlaylist();

  // Глобальная функция форматирования времени
  window.formatTime = function(seconds) {
    var minutes = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
  };

  // Глобальный обработчик обновления времени воспроизведения
  window.syncTimeUpdate = function() {
    var audio = window.currentPlayingAudio;
    if (!audio || !audio.duration) return;
    var container = $(audio).closest('.custom-audio-player');
    container.find('.progress-container .progress-bar').css('width', ((audio.currentTime / audio.duration) * 100) + '%');
    container.find('.time.current').text(window.formatTime(audio.currentTime));
    updateFloatingControlsProgress();
  };

  // Воспроизведение по индексу в плейлисте
  function playByIndex(idx) {
    if (idx < 0 || idx >= window.playlist.length) return;
    window.currentIndex = idx;
    playAudio(window.playlist[idx].id);
  }

  // Обновление метаданных Media Session API
  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !window.currentPlayingAudio) return;
    var title = window.currentPlayingContainer.find('.track-title').text() || '';
    navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: '', album: '', artwork: [] });
  }

  // Настройка Media Session action handlers
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play',  () => window.currentPlayingAudio && window.currentPlayingAudio.play());
    navigator.mediaSession.setActionHandler('pause', () => window.currentPlayingAudio && window.currentPlayingAudio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPreviousAudio);
    navigator.mediaSession.setActionHandler('nexttrack', playNextAudio);
    navigator.mediaSession.setActionHandler('seekto', ({seekTime, fastSeek}) => {
      if (window.currentPlayingAudio) {
        if (fastSeek && window.currentPlayingAudio.fastSeek) window.currentPlayingAudio.fastSeek(seekTime);
        else window.currentPlayingAudio.currentTime = seekTime;
      }
    });
  }

  // Основная функция воспроизведения аудио
  window.playAudio = function(audioId) {
    var audio = document.getElementById(audioId);
    if (!audio) return;
    if (window.currentPlayingAudio && window.currentPlayingAudio !== audio) {
      window.currentPlayingAudio.pause();
      window.currentPlayingAudio.removeEventListener('timeupdate', window.syncTimeUpdate);
    }
    window.currentPlayingAudio = audio;
    window.currentPlayingContainer = $(audio).closest('.custom-audio-player');
    window.currentAudioUrl = audio.currentSrc || audio.src;
    updatePlaylist();
    audio.removeEventListener('timeupdate', window.syncTimeUpdate);
    audio.addEventListener('timeupdate', window.syncTimeUpdate);
    audio.onended = playNextAudio;
    audio.play();
    updateFloatingControls();
    $('#fab-play-pause').text('Pause');
    updateMediaSessionMetadata();
  };

  window.pauseAudio = function(audioId) {
    var audio = document.getElementById(audioId);
    if (audio) {
      audio.pause();
      updateFloatingControls();
      $('#fab-play-pause').text('Play');
    }
  };

  window.stopAudio = function(audioId) {
    var audio = document.getElementById(audioId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      var container = $(audio).closest('.custom-audio-player');
      container.find('.progress-container .progress-bar').css('width', '0%');
      container.find('.time.current').text('0:00');
      window.currentAudioUrl = null;
      hideFloatingControls();
    }
  };

  // Переход к следующему и предыдущему треку
  function playNextAudio() {
    var next = window.currentIndex + 1;
    if (next >= window.playlist.length) {
      if (window.isLoop) next = 0;
      else { showNoNextAudioMessage(); return; }
    }
    playByIndex(next);
  }
  function playPreviousAudio() {
    var prev = window.currentIndex - 1;
    if (prev < 0) {
      if (window.isLoop) prev = window.playlist.length - 1;
      else return;
    }
    playByIndex(prev);
  }

  function showNoNextAudioMessage() {
    if (!window.floatingControlsOriginalHtml) {
      window.floatingControlsOriginalHtml = $('#floating-audio-controls').html();
    }
    $('#floating-audio-controls').html('<span class="no-next">Следующего аудио не найдено</span>');
    setTimeout(function() {
      if (window.currentPlayingAudio && !window.currentPlayingAudio.paused) {
        $('#floating-audio-controls').html(window.floatingControlsOriginalHtml);
      } else {
        hideFloatingControls();
        $('#floating-audio-controls').html(window.floatingControlsOriginalHtml);
      }
    }, 3000);
  }

  // Создание всплывающей панели
  if ($('#floating-audio-controls').length === 0) {
    $('body').append(
      `<div id="floating-audio-controls" class="floating-audio-controls" style="display:none; position:fixed; bottom:20px; right:20px; z-index:9999; background:#333; padding:10px; border-radius:10px;">
        <button id="fab-prev" class="fab-button fab-prev">Prev</button>
        <button id="fab-play-pause" class="fab-button fab-play-pause">Play</button>
        <button id="fab-stop" class="fab-button fab-stop">Stop</button>
        <button id="fab-next" class="fab-button fab-next">Next</button>
        <div class="fab-progress-container" style="width:100%; background:#555; height:5px; cursor:pointer; margin:5px 0; position:relative;">
          <div class="fab-progress-bar"></div>
        </div>
        <span class="fab-time fab-current-time" id="fab-current-time">0:00</span>  <span class="fab-time"> / </span>
        <span class="fab-time fab-duration" id="fab-duration">0:00</span>
      </div>`
    );
  }

  function hideFloatingControls() {
    $('#floating-audio-controls').fadeOut();
    window.currentPlayingAudio = null;
    window.currentPlayingContainer = null;
    window.currentAudioUrl = null;
  }
  function updateFloatingControls() {
    if (window.currentPlayingAudio) $('#floating-audio-controls').fadeIn();
  }
  function updateFloatingControlsProgress() {
    var audio = window.currentPlayingAudio;
    if (!audio || !audio.duration) return;
    var pct = (audio.currentTime / audio.duration) * 100;
    $('#floating-audio-controls .fab-progress-bar').css('width', pct + '%');
    $('#fab-current-time').text(window.formatTime(audio.currentTime));
    $('#fab-duration').text(window.formatTime(audio.duration));
  }

  // Обработчики кнопок
  $('#fab-prev').on('click', playPreviousAudio);
  $('#fab-play-pause').on('click', function() {
    if (!window.currentPlayingAudio) return;
    if (window.currentPlayingAudio.paused) {
      window.currentPlayingAudio.play();
      $(this).text('Pause');
    } else {
      window.currentPlayingAudio.pause();
      $(this).text('Play');
    }
    updateFloatingControls();
  });
  $('#fab-stop').on('click', function() {
    if (window.currentPlayingAudio) {
      window.currentPlayingAudio.pause();
      window.currentPlayingAudio.currentTime = 0;
      updateFloatingControlsProgress();
      hideFloatingControls();
    }
  });
  $('#fab-next').on('click', playNextAudio);
  $('#fab-loop').on('click', function() {
    window.isLoop = !window.isLoop;
    $(this).text('Loop: ' + (window.isLoop ? 'On' : 'Off'));
  });

  // Клик по прогресс-бару панели для перемотки
  $('#floating-audio-controls').on('click', '.fab-progress-container', function(e) {
    var audio = window.currentPlayingAudio;
    if (!audio || !audio.duration) return;
    var offset = $(this).offset().left;
    var pct = (e.pageX - offset) / $(this).width();
    audio.currentTime = pct * audio.duration;
    updateFloatingControlsProgress();
  });

  // Клик по таймлайну inline-плеера для перемотки
  $('.custom-audio-player').on('click', '.progress-container', function(e) {
    var audio = $(this).find('audio')[0];
    if (!audio.duration) return;
    var offset = $(this).offset().left;
    var pct = (e.pageX - offset) / $(this).width();
    audio.currentTime = pct * audio.duration;
  });

  $(window).on('scroll', updateFloatingControls);
  setInterval(updateFloatingControls, 1000);

  // Обработчик изменения проекта
  window.openProject = function(project) {
    $.get('/load_project', { project_name: project }, function(data) {
      if (data.success) {
        $('#editor').html(data.content);
        $('#main-header').fadeOut(200, function() { $(this).text(project).fadeIn(200); });
        document.title = project + ' | Артахана мастерская';
        $('.project-item').removeClass('selected');
        $(`.project-item[data-project="${project}"]`).addClass('selected');
        hideFloatingControls();
        updatePlaylist();
      } else {
        $('#editor').html('');
        $('#main-header').text('Артхана мастерская - Библиотека');
        document.title = 'Артахана мастерская - Проекты';
        alert(data.error);
      }
    });
  };
});

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    updateFloatingControls();
    updateFloatingControlsProgress();
  }
});
