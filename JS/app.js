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
