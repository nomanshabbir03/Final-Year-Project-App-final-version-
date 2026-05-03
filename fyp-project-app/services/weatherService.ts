import axios from 'axios';
import { api, parseJsonData, toApiErrorMessage } from './api';

type BackendWeatherResponse = {
  city?: string;
  temperature: number;
  temperature_min?: number;
  temperature_max?: number;
  condition: string;
  humidity: number;
};

export type WeatherSnapshot = {
  city: string;
  temperatureC: number;
  condition: string;
  minC: number;
  maxC: number;
  humidity: number;
  updatedAt: string;
};

export async function fetchWeatherByCity(city: string) {
  let response;
  try {
    response = await api.get<BackendWeatherResponse>('/weather/', {
      params: { city },
    });
  } catch (error) {
    throw toReadableWeatherError(error);
  }

  const payload = parseJsonData<BackendWeatherResponse>(response.data);

  const temp = Number(payload.temperature);
  const min = Number(payload.temperature_min);
  const max = Number(payload.temperature_max);
  const condition = payload.condition || 'Unknown';
  const resolvedCity = payload.city?.trim() || city;

  return {
    city: resolvedCity,
    temperatureC: temp,
    condition: normalizeCondition(condition),
    minC: Number.isFinite(min) ? min : temp,
    maxC: Number.isFinite(max) ? max : temp,
    humidity: Number(payload.humidity ?? 0),
    updatedAt: new Date().toLocaleTimeString(),
  } satisfies WeatherSnapshot;
}

function toReadableWeatherError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return new Error(toApiErrorMessage(error, 'Unable to load weather right now.'));
  }

  return new Error('Unable to fetch weather right now.');
}

function normalizeCondition(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('clear')) {
    return 'Sunny';
  }
  if (lower.includes('cloud')) {
    return 'Cloudy';
  }
  return value;
}
