/* ==========================================================================
   TASKFLOW — BOARD INTERACTIONS & LISTENERS (app.js)
   Handles form submissions, event delegation, shortcuts, and drag-and-drop.
   ========================================================================== */

function getDragAfterElement(list, y) {
  let cards = list.querySelectorAll(".task-card:not(.dragging)");
  let closest = null, maxOffset = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < cards.length; i++) {
    let box = cards[i].getBoundingClientRect();
    let offset = y - (box.top + box.height / 2);
    if (offset < 0 && offset > maxOffset) {
      maxOffset = offset;
      closest = cards[i];
    }
  }
  return closest;
}

function setupDragAndDrop() {
  let lists = document.querySelectorAll(".task-list");
  for (let i = 0; i < lists.length; i++) {
    let list = lists[i];
    list.addEventListener("dragover", function(e) {
      e.preventDefault();
      let after = getDragAfterElement(list, e.clientY);
      if (!after) list.appendChild(dropPlaceholder);
      else list.insertBefore(dropPlaceholder, after);
    });
    list.addEventListener("dragleave", function(e) {
      if (!list.contains(e.relatedTarget)) dropPlaceholder.remove();
    });
    list.addEventListener("drop", function(e) {
      e.preventDefault();
      let id = draggedTaskId || e.dataTransfer.getData("text/plain");
      let task = tasks.find(function(t) { return t.id === id; });
      if (!task) return;
      let targetStatus = list.getAttribute("data-status");
      let idx = [...list.children].indexOf(dropPlaceholder);
      
      pushToUndoStack();
      task.status = targetStatus;
      
      let other = tasks.filter(function(t) { return t.id !== id; });
      let colTasks = other.filter(function(t) { return t.status === targetStatus; }).sort(function(a, b) { return a.order - b.order; });
      colTasks.splice(idx === -1 ? colTasks.length : idx, 0, task);
      colTasks.forEach(function(t, i) { t.order = i; });
      
      tasks = other.filter(function(t) { return t.status !== targetStatus; }).concat(colTasks);
      saveToLocalStorage();
      renderBoard();
      showToast("Task moved successfully!", "success");
    });
  }
}

function handleTaskFormSubmit(e) {
  e.preventDefault();
  let id = document.getElementById("taskId").value;
  let title = document.getElementById("taskTitle").value.trim();
  let desc = document.getElementById("taskDesc").value.trim();
  let status = document.getElementById("taskStatus").value;
  let priority = document.getElementById("taskPriority").value;
  let dueDate = document.getElementById("taskDueDate").value;
  let rawLabels = document.getElementById("taskLabels").value;

  if (!title) return showToast("Title is required!", "error");
  let labels = rawLabels.split(",").map(function(s) { return s.trim(); }).filter(Boolean);

  pushToUndoStack();
  if (id) {
    let task = tasks.find(function(t) { return t.id === id; });
    if (task) {
      task.title = title;
      task.desc = desc;
      task.priority = priority;
      task.dueDate = dueDate;
      task.labels = labels;
      if (task.status !== status) {
        task.status = status;
        task.order = tasks.filter(function(t) { return t.status === status && t.id !== id; }).length;
      }
      showToast("Task updated successfully!", "success");
    }
  } else {
    tasks.push({
      id: generateId(), title: title, desc: desc, status: status, priority: priority,
      dueDate: dueDate, labels: labels, order: tasks.filter(function(t) { return t.status === status; }).length, createdAt: Date.now()
    });
    showToast("Task added successfully!", "success");
  }
  saveToLocalStorage();
  closeTaskModal();
  renderBoard();
}

function handleContextMenuAction(e) {
  let li = e.target.closest("li");
  if (!li || !contextMenuTaskId) return;
  let action = li.getAttribute("data-action");
  let id = contextMenuTaskId;
  closeContextMenu();
  let task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;

  if (action === "edit") openTaskModal(task);
  else if (action === "duplicate") {
    pushToUndoStack();
    let colTasks = tasks.filter(function(t) { return t.status === task.status; });
    tasks.push({ ...deepClone(task), id: generateId(), title: task.title + " (Copy)", createdAt: Date.now(), order: colTasks.length });
    saveToLocalStorage();
    renderBoard();
    showToast("Task duplicated!", "success");
  } else if (action === "delete") {
    if (confirm("Delete this task?")) {
      pushToUndoStack();
      tasks = tasks.filter(function(t) { return t.id !== id; });
      saveToLocalStorage();
      renderBoard();
      showToast("Task deleted!", "success");
    }
  } else if (STATUS_LIST.includes(action)) {
    if (task.status === action) return;
    pushToUndoStack();
    task.status = action;
    task.order = tasks.filter(function(t) { return t.status === action && t.id !== id; }).length;
    saveToLocalStorage();
    renderBoard();
    showToast("Task moved successfully!", "success");
  }
}

function exportTasksToJSON() {
  let blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  let link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "taskflow_backup.json";
  link.click();
  showToast("JSON backup exported!", "success");
}
function handleImportFileSelect(e) {
  let file = e.target.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(event) {
    try {
      let imported = JSON.parse(event.target.result);
      if (!Array.isArray(imported)) throw new Error();
      pushToUndoStack();
      tasks = imported.map(function(t) {
        return {
          id: t.id || generateId(), title: t.title || "Untitled", desc: t.desc || "",
          status: STATUS_LIST.includes(t.status) ? t.status : "todo",
          priority: ["low", "medium", "high"].includes(t.priority) ? t.priority : "medium",
          dueDate: t.dueDate || "", labels: Array.isArray(t.labels) ? t.labels : [],
          order: typeof t.order === "number" ? t.order : 0, createdAt: t.createdAt || Date.now()
        };
      });
      saveToLocalStorage();
      renderBoard();
      showToast("Backup imported!", "success");
    } catch (err) {
      showToast("Invalid JSON file.", "error");
    }
  };
  reader.readAsText(file);
}

function initEventBindings() {
  document.getElementById("closeModalBtn").addEventListener("click", closeTaskModal);
  document.getElementById("cancelModalBtn").addEventListener("click", closeTaskModal);
  document.getElementById("taskForm").addEventListener("submit", handleTaskFormSubmit);
  document.getElementById("openAddTaskBtn").addEventListener("click", function() { openTaskModal(null, "todo"); });

  let addButtons = document.querySelectorAll(".column-add-btn");
  for (let i = 0; i < addButtons.length; i++) {
    addButtons[i].addEventListener("click", function() { openTaskModal(null, addButtons[i].getAttribute("data-status")); });
  }

  document.getElementById("taskModalOverlay").addEventListener("click", function(e) {
    if (e.target.id === "taskModalOverlay") closeTaskModal();
  });

  document.getElementById("contextMenu").addEventListener("click", handleContextMenuAction);
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("exportBtn").addEventListener("click", exportTasksToJSON);
  document.getElementById("importBtn").addEventListener("click", function() { document.getElementById("importFileInput").click(); });
  document.getElementById("importFileInput").addEventListener("change", handleImportFileSelect);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("shortcutsBtn").addEventListener("click", openShortcutsModal);
  document.getElementById("closeShortcutsBtn").addEventListener("click", closeShortcutsModal);
  document.getElementById("shortcutsModalOverlay").addEventListener("click", function(e) {
    if (e.target.id === "shortcutsModalOverlay") closeShortcutsModal();
  });

  document.getElementById("clearAllBtn").addEventListener("click", function() {
    if (confirm("Delete all tasks from the board?")) {
      pushToUndoStack();
      tasks = [];
      saveToLocalStorage();
      renderBoard();
      showToast("Board cleared!", "warning");
    }
  });

  let searchInput = document.getElementById("searchInput");
  let clearSearchBtn = document.getElementById("clearSearchBtn");
  let searchBox = document.querySelector(".search-box");

  searchInput.addEventListener("input", function(e) {
    searchTerm = e.target.value;
    if (searchTerm) searchBox.classList.add("has-text");
    else searchBox.classList.remove("has-text");
    renderBoard();
  });

  clearSearchBtn.addEventListener("click", function() {
    searchInput.value = "";
    searchTerm = "";
    searchBox.classList.remove("has-text");
    renderBoard();
    searchInput.focus();
  });

  let filterCheckboxes = document.querySelectorAll(".filter-priority");
  for (let i = 0; i < filterCheckboxes.length; i++) {
    filterCheckboxes[i].addEventListener("change", function() {
      activePriorities = [];
      for (let j = 0; j < filterCheckboxes.length; j++) {
        if (filterCheckboxes[j].checked) activePriorities.push(filterCheckboxes[j].value);
      }
      renderBoard();
    });
  }

  document.getElementById("resetFilterBtn").addEventListener("click", function() {
    for (let i = 0; i < filterCheckboxes.length; i++) filterCheckboxes[i].checked = false;
    activePriorities = [];
    renderBoard();
  });

  let sortOptions = document.querySelectorAll(".sort-option");
  for (let i = 0; i < sortOptions.length; i++) {
    sortOptions[i].addEventListener("click", function() {
      sortMode = sortOptions[i].getAttribute("data-sort");
      for (let j = 0; j < sortOptions.length; j++) sortOptions[j].style.fontWeight = "400";
      sortOptions[i].style.fontWeight = "700";
      document.getElementById("sortDropdown").classList.remove("open");
      renderBoard();
    });
  }

  let board = document.getElementById("board");
  board.addEventListener("click", function(e) {
    let editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
      let id = editBtn.closest(".task-card").getAttribute("data-id");
      let task = tasks.find(function(t) { return t.id === id; });
      if (task) openTaskModal(task);
      return;
    }
    let deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn) {
      let id = deleteBtn.closest(".task-card").getAttribute("data-id");
      if (confirm("Delete this task?")) {
        pushToUndoStack();
        tasks = tasks.filter(function(t) { return t.id !== id; });
        saveToLocalStorage();
        renderBoard();
        showToast("Task deleted!", "success");
      }
      return;
    }
    let menuBtn = e.target.closest(".task-card-menu-btn");
    if (menuBtn) {
      let id = menuBtn.closest(".task-card").getAttribute("data-id");
      let rect = menuBtn.getBoundingClientRect();
      openContextMenuAtCoordinates(rect.left, rect.bottom + 5, id);
    }
  });

  board.addEventListener("dblclick", function(e) {
    let card = e.target.closest(".task-card");
    if (card) {
      let id = card.getAttribute("data-id");
      let task = tasks.find(function(t) { return t.id === id; });
      if (task) openTaskModal(task);
    }
  });
}

function setupDropdownListeners() {
  let dropdownConfigs = [
    { btnId: "filterBtn", dropdownId: "filterDropdown" },
    { btnId: "sortBtn", dropdownId: "sortDropdown" },
    { btnId: "moreBtn", dropdownId: "moreDropdown" }
  ];
  for (let i = 0; i < dropdownConfigs.length; i++) {
    let cfg = dropdownConfigs[i];
    let btn = document.getElementById(cfg.btnId);
    let dropdown = document.getElementById(cfg.dropdownId);
    if (btn && dropdown) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        for (let j = 0; j < dropdownConfigs.length; j++) {
          if (dropdownConfigs[j].dropdownId !== cfg.dropdownId) {
            let other = document.getElementById(dropdownConfigs[j].dropdownId);
            if (other) other.classList.remove("open");
          }
        }
        dropdown.classList.toggle("open");
      });
    }
  }
  document.addEventListener("click", function(e) {
    for (let i = 0; i < dropdownConfigs.length; i++) {
      let dropdown = document.getElementById(dropdownConfigs[i].dropdownId);
      if (dropdown && !dropdown.contains(e.target)) dropdown.classList.remove("open");
    }
    closeContextMenu();
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", function(e) {
    let isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key.toLowerCase() === "n") { e.preventDefault(); openTaskModal(); }
    if (isCtrl && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if (isCtrl && e.key.toLowerCase() === "f") { e.preventDefault(); document.getElementById("searchInput").focus(); }
    if (isCtrl && e.key.toLowerCase() === "d") { e.preventDefault(); toggleTheme(); }
    if (e.key === "Escape") {
      closeTaskModal();
      closeContextMenu();
      closeShortcutsModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", function() {
  initTheme();
  loadFromLocalStorage();
  initEventBindings();
  setupDragAndDrop();
  setupDropdownListeners();
  setupKeyboardShortcuts();
  renderBoard();
  let loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    setTimeout(function() { loadingScreen.classList.add("hidden"); }, 450);
  }
});
