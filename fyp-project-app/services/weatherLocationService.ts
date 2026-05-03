import { api, parseJsonData } from './api';

export type SavedLocationDto = {
  id: string;
  city: string;
  label: string;
  createdAt: string;
};

type SavedLocationApiDto = {
  id?: number | string;
  city?: string;
  label?: string;
  created_at?: string;
};

function normalizeLocation(item: SavedLocationApiDto): SavedLocationDto {
  return {
    id: String(item.id ?? Date.now()),
    city: item.city ?? 'Unknown',
    label: item.label ?? '',
    createdAt: item.created_at ?? '',
  };
}

export async function getSavedLocations(): Promise<SavedLocationDto[]> {
  const response = await api.get('/weather/locations/');
  const data = parseJsonData<unknown>(response.data);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => normalizeLocation(row as SavedLocationApiDto));
}

export async function addSavedLocation(city: string, label = ''): Promise<SavedLocationDto> {
  const response = await api.post('/weather/locations/', { city, label });
  return normalizeLocation(parseJsonData<SavedLocationApiDto>(response.data));
}

export async function deleteSavedLocation(id: string): Promise<void> {
  await api.delete(`/weather/locations/${id}/`);
}
