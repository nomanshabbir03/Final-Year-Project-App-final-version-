import { api, parseJsonData } from './api';

function normalizePriority(priority) {
  if (priority === 'High' || priority === 'Medium' || priority === 'Low') {
    return priority;
  }
  return 'Medium';
}

function normalizeTask(task) {
  return {
    id: String(task?.id ?? task?._id ?? Date.now()),
    title: task?.title ?? 'Untitled Task',
    description: task?.description ?? '',
    priority: normalizePriority(task?.priority),
    deadline: task?.deadline ?? new Date().toISOString().split('T')[0],
    done: Boolean(task?.done ?? false),
  };
}

export async function getTasks() {
  const response = await api.get('/tasks/');
  const data = parseJsonData(response.data);
  const raw = Array.isArray(data) ? data : data?.tasks ?? [];
  return raw.map(normalizeTask);
}

export async function createTask(taskPayload) {
  const response = await api.post('/tasks/', taskPayload);
  const data = parseJsonData(response.data);
  return normalizeTask(data);
}

export async function deleteTask(id) {
  await api.delete(`/tasks/${id}/`);
  return { id };
}
