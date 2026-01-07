// task.js
$(document).ready(function() {
  // Map state values to display text
  const stateTextMap = {
    "pending": "Pending",
    "in-progress": "In Progress",
    "completed": "Completed",
    "failed": "Failed",
    "cancelled": "Cancelled"
  };

  // --- ЛОГИКА СИНХРОНИЗАЦИИ ИНТЕРФЕЙСА ---

  let syncTimeout; // Переменная для задержки
  
  /**
   * Эта функция находит все задачи на странице и устанавливает
   * для их выпадающих списков правильное значение из атрибута data-state.
   */
  function syncTaskStates() {
    $('#editor .task').each(function() {
      const $task = $(this);
      const savedState = $task.attr('data-state') || 'pending';
      // Находим <select> внутри ЭТОЙ задачи и устанавливаем значение
      $task.find('.task-state').val(savedState);
    });
  }

  // --- НАСТРОЙКА "СЛУШАТЕЛЯ" ДЛЯ #editor ---

  const editorElement = document.getElementById('editor');

  if (editorElement) {
    // Создаем наблюдателя за изменениями в DOM
    const observer = new MutationObserver(function(mutations) {
      // Чтобы не запускать функцию сотни раз при сложной загрузке,
      // мы используем небольшую задержку (debounce).
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(syncTaskStates, 50); // Ждем 50мс после последнего изменения
    });

    // Запускаем наблюдателя: следить за дочерними элементами в #editor
    observer.observe(editorElement, {
      childList: true, // реагировать на добавление/удаление элементов
      subtree: true    // реагировать на изменения во всех вложенных элементах
    });
  }
  
  // Первый запуск синхронизации на случай, если задачи уже есть на странице
  syncTaskStates();


  // --- ОБРАБОТЧИКИ СОБЫТИЙ (остаются без изменений) ---

  // Function to create a new task container (timeline container)
  function createTimelineContainer() {
    const taskCounter = new Date().getTime();
    return $('<div>', {
      id: 'task_container_' + taskCounter,
      class: 'task-list'
    });
  }
  
  // Function to create a NEW task element
  function createTaskElement() {
    const currentId = 'new_' + new Date().getTime();
    const state = 'pending';

    const $task = $('<div>', {
      id: 'task_' + currentId,
      class: 'task ' + state,
      'data-id': currentId,
      'data-state': state,
      contenteditable: false
    });

    const $dot = $('<div>', { class: 'task-dot' });
    const $dotLabel = $('<span>', { class: 'dot-state-label' }).text(stateTextMap[state]);
    $dot.append($dotLabel);

    const $details = $('<div>', { class: 'task-details' });
    const $titleContainer = $('<div>', { class: 'task-title-container' });
    const $titleInput = $('<input>', { type: 'text', class: 'task-title-input', placeholder: 'Task title...'});
    const $saveTitleBtn = $('<button>', { type: 'button', class: 'task-save-title'}).text('Save');
    const $titleStatic = $('<span>', { class: 'task-title-static', style: 'display:none;' });
    const $hiddenTitle = $('<input>', { type: 'hidden', class: 'meta-title', name: 'title' });
    const $hiddenState = $('<input>', { type: 'hidden', class: 'meta-state', name: 'state' }).val(state);
    $titleContainer.append($titleInput, $saveTitleBtn, $titleStatic, $hiddenTitle, $hiddenState);

    const $actions = $('<div>', { class: 'task-actions' });
    const $stateSelect = $('<select>', { class: 'task-state' });
    for (const value in stateTextMap) {
      $stateSelect.append($('<option>', { value: value }).text(stateTextMap[value]));
    }
    $stateSelect.val(state);
                
    const $deleteButton = $('<button>', { class: 'task-delete' }).text('Delete');
    $actions.append($stateSelect, $deleteButton);
    $details.append($titleContainer, $actions);
    $task.append($dot, $details);
    return $task;
  }

  // "Add Task" button click handler
  $('#task').click(function() {
    let $cont = null;
    const sel = window.getSelection();
    if (sel.rangeCount) {
        $cont = $(sel.getRangeAt(0).startContainer).closest('.task-list');
    }
    if (!$cont || !$cont.length) {
      $cont = createTimelineContainer();
      $('#editor').append($cont);
    }
    const $task = createTaskElement();
    $cont.append($task);
    $task.find('.task-title-input').focus();
  });

  // Edit title on double-click
  $(document).on('dblclick', '.task-title-static', function() {
    const $staticTitle = $(this);
    const $titleContainer = $staticTitle.closest('.task-title-container');
    $titleContainer.find('.task-title-input').val($staticTitle.text()).show().focus();
    $titleContainer.find('.task-save-title').show();
    $staticTitle.hide();
  });

  // Save title button click handler
  $(document).on('click', '.task-save-title', function(e) {
    e.stopPropagation();
    const $btn = $(this);
    const $titleContainer = $btn.closest('.task-title-container');
    const newTitle = $titleContainer.find('.task-title-input').val().trim();
    if (!newTitle) {
        alert("Title cannot be empty");
        return;
    }
    $titleContainer.find('.task-title-static').text(newTitle).show();
    $titleContainer.find('.meta-title').val(newTitle);
    $titleContainer.find('.task-title-input, .task-save-title').hide();
  });

  // Change task state
  $(document).on('change', '.task-state', function() {
    const newState = $(this).val();
    const $task = $(this).closest('.task');
    
    $task.attr('data-state', newState);
    
    $task.removeClass('pending in-progress completed failed cancelled').addClass(newState);
    $task.find('.dot-state-label').text(stateTextMap[newState]);
    $task.find('.meta-state').val(newState);
    
    const $container = $task.closest('.task-list');
    $container.toggleClass('has-failed', $container.find('.task.failed').length > 0);
  });

  // Delete task
  $(document).on('click', '.task-delete', function() {
    const $task = $(this).closest('.task');
    const $container = $task.closest('.task-list');
    $task.slideUp(300, function() {
      $task.remove();
      if (!$container.find('.task').length) {
        $container.slideUp(300, function() { $container.remove(); });
      }
    });
  });
});