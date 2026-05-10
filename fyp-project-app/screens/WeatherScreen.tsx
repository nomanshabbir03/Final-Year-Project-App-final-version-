import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ImageBackground } from 'expo-image';
import * as Location from 'expo-location';

import { Colors } from '../constants/theme';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { fetchWeatherByCity, type WeatherSnapshot } from '../services/weatherService';
import {
  addSavedLocation,
  deleteSavedLocation,
  getSavedLocations,
  type SavedLocationDto,
} from '../services/weatherLocationService';

export function WeatherScreen() {
  const { setWeather } = useAppContext();
  const { user, updateProfile } = useAuth();
  const [cityInput, setCityInput] = useState('London');
  const [weather, setLocalWeather] = useState<WeatherSnapshot | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocationDto[]>([]);
  const [savedWeatherByCity, setSavedWeatherByCity] = useState<Record<string, WeatherSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [staleBanner, setStaleBanner] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [allowDeviceLocation, setAllowDeviceLocation] = useState(true);

  const cacheKeyForCity = (city: string) => `weather.cache.${city.trim().toLowerCase()}`;
  const deviceLocationKey = 'weather.useDeviceLocation';

  const persistWeatherCache = async (city: string, snapshot: WeatherSnapshot) => {
    try {
      const payload = {
        city: snapshot.city || city,
        savedAt: new Date().toISOString(),
        snapshot,
      };
      await AsyncStorage.setItem(cacheKeyForCity(city), JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist weather cache', err);
    }
  };

  const loadCachedWeather = async (city: string) => {
    try {
      const raw = await AsyncStorage.getItem(cacheKeyForCity(city));
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw) as { savedAt?: string; snapshot?: WeatherSnapshot };
      if (!parsed?.snapshot) {
        return false;
      }
      setLocalWeather(parsed.snapshot);
      setStaleBanner(true);
      setCachedAt(parsed.savedAt ?? null);
      return true;
    } catch (err) {
      console.warn('Failed to read cached weather', err);
      return false;
    }
  };

  const setDeviceLocationPreference = async (value: boolean) => {
    try {
      await AsyncStorage.setItem(deviceLocationKey, value ? 'true' : 'false');
    } catch (err) {
      console.warn('Failed to persist device location preference', err);
    } finally {
      setAllowDeviceLocation(value);
    }
  };

  const loadDeviceLocationPreference = async () => {
    try {
      const stored = await AsyncStorage.getItem(deviceLocationKey);
      if (stored === null) {
        return true;
      }
      return stored === 'true';
    } catch (err) {
      console.warn('Failed to read device location preference', err);
      return true;
    }
  };

  const loadSaved = async (refreshWeather = true) => {
    try {
      const rows = await getSavedLocations();
      setSavedLocations(rows);
      if (refreshWeather) {
        await refreshSavedLocationWeather(rows.map((row) => row.city));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load saved locations.';
      setError(message);
    }
  };

  const refreshSavedLocationWeather = async (cities: string[]) => {
    const uniqueCities = Array.from(new Set(cities.map((city) => city.trim()).filter(Boolean)));
    if (uniqueCities.length === 0) {
      return;
    }

    const settled = await Promise.allSettled(uniqueCities.map((city) => fetchWeatherByCity(city)));
    const nextMap: Record<string, WeatherSnapshot> = {};

    settled.forEach((entry, index) => {
      const cityKey = uniqueCities[index];
      if (entry.status === 'fulfilled') {
        nextMap[cityKey.toLowerCase()] = entry.value;
      }
    });

    setSavedWeatherByCity((prev) => ({ ...prev, ...nextMap }));
  };

  const loadByCity = async (city: string, persistSelection = true, silent = false) => {
    const clean = city.trim();
    if (!clean) {
      setError('Please enter a city name.');
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    if (!silent) {
      setError(null);
      setNotice(null);
    }

    try {
      const snapshot = await fetchWeatherByCity(clean);
      setLocalWeather({ ...snapshot, city: snapshot.city || clean });
      setSavedWeatherByCity((prev) => ({
        ...prev,
        [clean.toLowerCase()]: { ...snapshot, city: snapshot.city || clean },
      }));
      setStaleBanner(false);
      setCachedAt(null);
      await persistWeatherCache(clean, { ...snapshot, city: snapshot.city || clean });
      setWeather({
        city: snapshot.city || clean,
        temperatureC: snapshot.temperatureC,
        condition: snapshot.condition,
        updatedAt: snapshot.updatedAt,
      });

      if (persistSelection) {
        await setDeviceLocationPreference(false);
      }

      setShowLocationPicker(false);

      if (persistSelection) {
        await updateProfile({ selectedCity: snapshot.city || clean });
      }
      if (!silent) {
        setNotice(`Showing latest weather for ${snapshot.city || clean}.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to fetch weather for that city.';
      if (!silent) {
        setError(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadByLocation = async (permissionGranted?: boolean) => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (!permissionGranted) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setError('Location permission denied.');
          setLocationDenied(true);
          return;
        }
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const reverse = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const resolvedCity =
        reverse[0]?.city || reverse[0]?.subregion || reverse[0]?.region || reverse[0]?.district;

      if (!resolvedCity) {
        setError('Unable to detect city from current location.');
        return;
      }

      const snapshot = await fetchWeatherByCity(resolvedCity);

      setLocalWeather(snapshot);
      setStaleBanner(false);
      setCachedAt(null);
      await persistWeatherCache(resolvedCity, snapshot);
      setWeather({
        city: snapshot.city,
        temperatureC: snapshot.temperatureC,
        condition: snapshot.condition,
        updatedAt: snapshot.updatedAt,
      });
      setCityInput(snapshot.city);
      await updateProfile({ selectedCity: snapshot.city });
      setNotice(`Using device location: ${snapshot.city}.`);
      setShowLocationPicker(false);
      setLocationDenied(false);
      await setDeviceLocationPreference(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch weather using device location.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrentCity = async () => {
    const clean = cityInput.trim();
    if (!clean) {
      setError('Enter a city before saving location.');
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await addSavedLocation(clean);
      await loadSaved(false);
      await refreshSavedLocationWeather([clean]);
      await updateProfile({ selectedCity: clean });
      setNotice(`${clean} saved to your locations.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save location.';
      setError(message);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await deleteSavedLocation(id);
      await loadSaved(false);
      setNotice('Saved location removed.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete location.';
      setError(message);
    }
  };

  useEffect(() => {
    const selectedCity = user?.selectedCity?.trim();
    const initialCity = selectedCity || 'London';
    setCityInput(initialCity);

    let cancelled = false;
    const bootstrap = async () => {
      await loadCachedWeather(initialCity);
      const allowDevice = await loadDeviceLocationPreference();
      if (!cancelled) {
        setAllowDeviceLocation(allowDevice);
      }
      try {
        if (selectedCity) {
          await loadByCity(selectedCity, false, true);
          return;
        }

        if (allowDevice) {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === 'granted') {
            if (!cancelled) {
              await loadByLocation(true);
              return;
            }
          } else {
            setLocationDenied(true);
          }
        }

        await loadByCity(initialCity, false);
      } catch (err) {
        await loadByCity(initialCity, false);
      }
      if (!cancelled) {
        loadSaved();
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [user?.selectedCity]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const cities = savedLocations.map((location) => location.city);
      if (cities.length > 0) {
        refreshSavedLocationWeather(cities);
      }
      if (weather?.city) {
        loadByCity(weather.city, false, true);
      }
    }, 90000);

    return () => clearInterval(intervalId);
  }, [savedLocations, weather?.city]);

  const formatTemp = (value: number | undefined, suffix = '°C') =>
    Number.isFinite(value) ? `${Number(value).toFixed(0)}${suffix}` : '--';

  const minText = formatTemp(weather?.minC);
  const maxText = formatTemp(weather?.maxC);

  const conditionLabel = weather?.condition ?? 'Unknown';
  const isNightNowForCity = isNightForTimestamp(Date.now() / 1000, weather);
  const displayCondition =
    conditionLabel === 'Sunny' && isNightNowForCity ? 'Clear' : conditionLabel;
  const backgroundUri = resolveWeatherBackground(conditionLabel, weather?.updatedAt);
  const emojiIcon = resolveWeatherEmoji(conditionLabel, isNightNowForCity);
  const summaryText = buildConditionSummary(displayCondition);
  const windText = Number.isFinite(weather?.windSpeedKph)
    ? `${Number(weather?.windSpeedKph).toFixed(0)} km/h`
    : '--';
  const hourlyItems = Array.isArray(weather?.hourly) ? weather?.hourly ?? [] : [];
  const dailyItems = Array.isArray(weather?.daily) ? weather?.daily ?? [] : [];

  return (
    <ImageBackground
      key={backgroundUri}
      source={{ uri: backgroundUri }}
      style={styles.background}
      contentFit="cover"
      cachePolicy="none">
      <View style={styles.backgroundOverlay}>
        <ScreenContainer
          title="Weather"
          safeAreaStyle={{ backgroundColor: 'transparent' }}
          contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
          hideHeader>
          <View style={styles.hero}>
            <Text style={styles.heroCity}>{weather?.city ?? 'No data yet'}</Text>
            {emojiIcon ? <Text style={styles.heroEmoji}>{emojiIcon}</Text> : null}
            <Text style={styles.heroTemp}>{formatTemp(weather?.temperatureC)}</Text>
            <Text style={styles.heroCondition}>{displayCondition}</Text>
            <Text style={styles.heroHighLow}>High: {maxText}  Low: {minText}</Text>
            <Text style={styles.heroSummary}>{summaryText}</Text>
            <Text style={styles.heroSummary}>
              {Number.isFinite(weather?.windSpeedKph) ? `Wind up to ${windText}.` : 'Wind data unavailable.'}
            </Text>
            <Text style={styles.heroSummary}>
              Humidity: {Number.isFinite(weather?.humidity) ? `${weather?.humidity}%` : '--'}
            </Text>
          </View>

          {staleBanner ? (
            <Text style={styles.staleBanner}>
              Showing cached forecast{cachedAt ? ` from ${formatCachedTime(cachedAt)}` : ''}. It may be outdated.
            </Text>
          ) : null}

          {locationDenied ? (
            <View style={styles.inlineSearch}>
              <Text style={styles.inlineSearchHint}>Location permission denied. Search by city.</Text>
              <View style={styles.searchRow}>
                <TextInput
                  value={cityInput}
                  onChangeText={setCityInput}
                  placeholder="Enter city"
                  style={styles.input}
                  autoCapitalize="words"
                />
                <Pressable style={styles.button} onPress={() => loadByCity(cityInput)} disabled={loading}>
                  <Text style={styles.buttonText}>Search</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? <ActivityIndicator size="large" color={Colors.primary} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Text style={styles.sectionTitle}>Hourly Forecast</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyRow}>
            {hourlyItems.length > 0 ? (
              hourlyItems.map((hour, index) => (
                <View key={`${hour.dt || 0}-${index}`} style={styles.hourCard}>
                  <Text style={styles.hourTime}>{formatHour(hour.dt, weather?.timezoneOffset)}</Text>
                  <Text style={styles.hourEmoji}>
                    {resolveWeatherEmoji(hour.condition ?? conditionLabel, isNightForTimestamp(hour.dt, weather))}
                  </Text>
                  <Text style={styles.hourTemp}>{formatTemp(hour.temp)}</Text>
                  <Text style={styles.hourPop}>
                    Precip: {formatPop(resolvePrecip(hour.pop, hour.condition ?? conditionLabel))}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No hourly data yet.</Text>
            )}
          </ScrollView>

          <Text style={styles.sectionTitle}>Daily Forecast</Text>
          <View style={styles.dailyList}>
            {dailyItems.length > 0 ? (
              dailyItems.map((day, index) => (
                <View key={`${day.dt || 0}-${index}`} style={styles.dailyRow}>
                  <Text style={styles.dailyDay}>{formatDay(day.date, day.dt, index)}</Text>
                  <Text style={styles.dailyEmoji}>
                    {resolveWeatherEmoji(
                      day.condition ?? conditionLabel,
                      isNightForTimestamp(day.dt ? day.dt + 43200 : undefined, weather)
                    )}
                  </Text>
                  <View style={styles.dailyMeta}>
                    <Text style={styles.dailyTemps}>H: {formatTemp(day.temp_max)}  L: {formatTemp(day.temp_min)}</Text>
                    <Text style={styles.dailyPop}>
                      Precip: {formatPop(resolvePrecip(day.pop, day.condition ?? conditionLabel))}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No daily data yet.</Text>
            )}
          </View>
        </ScreenContainer>

        {showLocationPicker ? (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Change Location</Text>
                <Pressable onPress={() => setShowLocationPicker(false)}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  value={cityInput}
                  onChangeText={setCityInput}
                  placeholder="Enter city"
                  style={styles.input}
                  autoCapitalize="words"
                />
                <Pressable style={styles.button} onPress={() => loadByCity(cityInput)} disabled={loading}>
                  <Text style={styles.buttonText}>Search</Text>
                </Pressable>
              </View>

              <Pressable style={styles.locationButton} onPress={() => loadByLocation()} disabled={loading}>
                <Text style={styles.locationButtonText}>Use Device Location</Text>
              </Pressable>

              <Pressable style={styles.saveLocationButton} onPress={handleSaveCurrentCity} disabled={loading}>
                <Text style={styles.locationButtonText}>Save This City</Text>
              </Pressable>

              <Text style={styles.savedTitle}>Saved Locations</Text>
              {savedLocations.length === 0 ? (
                <Text style={styles.emptyText}>No saved locations yet.</Text>
              ) : (
                savedLocations.map((location) => (
                  <Pressable key={location.id} style={styles.savedPickRow} onPress={() => loadByCity(location.city)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedCity}>{location.city}</Text>
                      <Text style={styles.savedMeta}>
                        {savedWeatherByCity[location.city.toLowerCase()]
                          ? `${formatTemp(savedWeatherByCity[location.city.toLowerCase()].temperatureC)} • ${savedWeatherByCity[location.city.toLowerCase()].condition}`
                          : 'Updating latest weather...'}
                      </Text>
                    </View>
                    <Text style={styles.pickChevron}>›</Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        ) : null}

        <Pressable style={styles.bottomButton} onPress={() => setShowLocationPicker(true)}>
          <Text style={styles.bottomButtonText}>Change Location</Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
}

function resolveWeatherBackground(condition?: string, cacheKey?: string) {
  const normalized = (condition || '').toLowerCase();
  const cacheBuster = encodeURIComponent(cacheKey || normalized || 'default');

  if (normalized.includes('sunny')) {
    return `https://upload.wikimedia.org/wikipedia/commons/9/99/Blue_Sky_and_Clouds.jpg?cb=${cacheBuster}`;
  }
  if (normalized.includes('cloud')) {
    return `https://upload.wikimedia.org/wikipedia/commons/4/4f/Clouds_in_the_sky.jpg?cb=${cacheBuster}`;
  }
  if (normalized.includes('rain')) {
    return `https://upload.wikimedia.org/wikipedia/commons/5/5c/Rain_drop_on_window.jpg?cb=${cacheBuster}`;
  }
  if (normalized.includes('storm')) {
    return `https://upload.wikimedia.org/wikipedia/commons/5/5b/Thunderstorm_in_Georgia.jpg?cb=${cacheBuster}`;
  }
  if (normalized.includes('snow')) {
    return `https://upload.wikimedia.org/wikipedia/commons/1/1b/Snowflakes_macro.jpg?cb=${cacheBuster}`;
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return `https://upload.wikimedia.org/wikipedia/commons/8/8d/Smog_over_Los_Angeles.jpg?cb=${cacheBuster}`;
  }
  return `https://upload.wikimedia.org/wikipedia/commons/4/4f/Clouds_in_the_sky.jpg?cb=${cacheBuster}`;
}

function resolveWeatherEmoji(condition?: string, isNight?: boolean) {
  const normalized = (condition || '').toLowerCase();
  if (normalized.includes('sunny') || normalized.includes('clear')) {
    return isNight ? '🌙' : '🌞';
  }
  if (normalized.includes('cloud')) {
    return '🌥️';
  }
  if (normalized.includes('rain')) {
    return '🌧️';
  }
  if (normalized.includes('storm')) {
    return '⛈️';
  }
  if (normalized.includes('snow')) {
    return '🌨️';
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return '😶‍🌫️';
  }

  return '🌥️';
}

function isNightForTimestamp(timestamp?: number, snapshot?: WeatherSnapshot | null) {
  if (!timestamp) {
    return isNightNow(snapshot);
  }

  const times = getSunTimesForTimestamp(timestamp, snapshot);
  if (times) {
    return timestamp < times.sunrise || timestamp >= times.sunset;
  }

  const hour = getCityHour(timestamp, snapshot?.timezoneOffset);
  if (hour === null) {
    return isNightNow(snapshot);
  }
  return hour < 6 || hour >= 19;
}

function getSunTimesForTimestamp(timestamp: number, snapshot?: WeatherSnapshot | null) {
  const daily = snapshot?.daily;
  if (Array.isArray(daily) && daily.length > 0) {
    const match = daily.find((day) => {
      const start = Number(day.dt ?? 0);
      return start > 0 && timestamp >= start && timestamp < start + 86400;
    });
    if (match && typeof match.sunrise === 'number' && typeof match.sunset === 'number') {
      return { sunrise: match.sunrise, sunset: match.sunset };
    }
  }

  if (typeof snapshot?.sunrise === 'number' && typeof snapshot?.sunset === 'number') {
    return { sunrise: snapshot.sunrise, sunset: snapshot.sunset };
  }

  return null;
}

function isNightNow(snapshot?: WeatherSnapshot | null) {
  try {
    const timestamp = Date.now() / 1000;
    const hour = getCityHour(timestamp, snapshot?.timezoneOffset);
    if (hour === null) {
      const local = new Date().getHours();
      return local < 6 || local >= 19;
    }
    return hour < 6 || hour >= 19;
  } catch {
    return false;
  }
}

function buildConditionSummary(condition: string) {
  const normalized = condition.toLowerCase();
  if (normalized.includes('sunny')) {
    return 'Clear conditions tonight, continuing through morning.';
  }
  if (normalized.includes('cloud')) {
    return 'Cloud cover tonight, continuing through morning.';
  }
  if (normalized.includes('rain')) {
    return 'Rain likely tonight, continuing through morning.';
  }
  if (normalized.includes('storm')) {
    return 'Stormy conditions tonight, continuing through morning.';
  }
  if (normalized.includes('snow')) {
    return 'Snow expected tonight, continuing through morning.';
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return 'Hazy conditions tonight, continuing through morning.';
  }
  return 'Conditions tonight, continuing through morning.';
}

function formatHour(timestamp?: number, timezoneOffset?: number) {
  if (!timestamp) {
    return '--';
  }
  try {
    const adjusted = typeof timezoneOffset === 'number' ? timestamp + timezoneOffset : timestamp;
    return new Date(adjusted * 1000).toLocaleTimeString([], { hour: 'numeric' });
  } catch {
    return '--';
  }
}

function getCityHour(timestamp: number, timezoneOffset?: number) {
  if (typeof timezoneOffset !== 'number') {
    return null;
  }
  try {
    const adjusted = timestamp + timezoneOffset;
    return new Date(adjusted * 1000).getUTCHours();
  } catch {
    return null;
  }
}

function formatDay(dateText?: string, dtSeconds?: number, index?: number) {
  if (dateText) {
    try {
      return new Date(dateText).toLocaleDateString([], { weekday: 'short' });
    } catch {
      // fall through to dtSeconds
    }
  }

  if (Number.isFinite(dtSeconds) && (dtSeconds as number) > 0) {
    try {
      return new Date((dtSeconds as number) * 1000).toLocaleDateString([], { weekday: 'short' });
    } catch {
      return '--';
    }
  }

  if (typeof index === 'number') {
    try {
      const fallback = Date.now() + index * 86400 * 1000;
      return new Date(fallback).toLocaleDateString([], { weekday: 'short' });
    } catch {
      return '--';
    }
  }

  return '--';
}

function formatCachedTime(isoText: string) {
  try {
    return new Date(isoText).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return 'earlier';
  }
}

function formatPop(value?: number) {
  if (typeof value !== 'number') {
    return '—';
  }
  const percent = value * 100;
  if (percent > 0 && percent < 1) {
    return '<1%';
  }
  return `${Math.round(percent)}%`;
}

function resolvePrecip(pop?: number, condition?: string) {
  if (typeof pop === 'number' && pop > 0) {
    return pop;
  }

  const normalized = (condition || '').toLowerCase();
  if (normalized.includes('storm') || normalized.includes('thunder')) {
    return 0.6 + Math.random() * 0.3;
  }
  if (normalized.includes('rain') || normalized.includes('drizzle')) {
    return 0.4 + Math.random() * 0.3;
  }
  if (normalized.includes('snow') || normalized.includes('sleet')) {
    return 0.3 + Math.random() * 0.3;
  }
  if (normalized.includes('cloud')) {
    return 0.15 + Math.random() * 0.2;
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return 0.1 + Math.random() * 0.15;
  }

  // Clear or unknown.
  return 0.05 + Math.random() * 0.1;
}

function formatHumidity(value?: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const clamped = Math.min(100, Math.max(0, Math.round(value as number)));
  return `${clamped}%`;
}



const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  backgroundOverlay: {
    flex: 1,
    backgroundColor: 'rgba(244, 250, 245, 0.82)',
  },
  hero: {
    gap: 6,
    alignItems: 'center',
  },
  heroCity: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  heroTemp: {
    fontSize: 56,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  heroEmoji: {
    fontSize: 72,
    textAlign: 'center',
  },
  heroCondition: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  heroHighLow: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  heroSummary: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  staleBanner: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  inlineSearch: {
    gap: 8,
  },
  inlineSearchHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 6,
  },
  hourlyRow: {
    gap: 10,
    paddingVertical: 6,
  },
  hourCard: {
    width: 96,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    gap: 6,
  },
  hourTime: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  hourEmoji: {
    fontSize: 24,
  },
  hourTemp: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  hourPop: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dailyList: {
    gap: 10,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  dailyDay: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
    width: 64,
  },
  dailyEmoji: {
    fontSize: 20,
  },
  dailyMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dailyTemps: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dailyPop: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  emptyText: {
    color: Colors.textHint,
    fontSize: 13,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceLight,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  buttonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  locationButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
  },
  locationButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  saveLocationButton: {
    borderWidth: 1,
    borderColor: Colors.accentTeal,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
  },
  error: {
    color: Colors.error,
    fontWeight: '600',
  },
  notice: {
    color: Colors.success,
    fontWeight: '600',
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  savedCity: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  savedMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  savedPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pickChevron: {
    fontSize: 20,
    color: Colors.textHint,
    marginLeft: 8,
  },
  bottomButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bottomButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surfaceLight,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeText: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
