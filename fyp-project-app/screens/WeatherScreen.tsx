import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
      setWeather({
        city: snapshot.city || clean,
        temperatureC: snapshot.temperatureC,
        condition: snapshot.condition,
        updatedAt: snapshot.updatedAt,
      });

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

  const loadByLocation = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission denied.');
        return;
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
      setWeather({
        city: snapshot.city,
        temperatureC: snapshot.temperatureC,
        condition: snapshot.condition,
        updatedAt: snapshot.updatedAt,
      });
      setCityInput(snapshot.city);
      await updateProfile({ selectedCity: snapshot.city });
      setNotice(`Using device location: ${snapshot.city}.`);
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
    loadByCity(initialCity, false);
    loadSaved();
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

  const minText = weather && Number.isFinite(weather.minC) ? `${Math.round(weather.minC)}°C` : '--';
  const maxText = weather && Number.isFinite(weather.maxC) ? `${Math.round(weather.maxC)}°C` : '--';

  return (
    <ScreenContainer
      title="Weather Forecast"
      subtitle="Get real-time weather updates, save favorite locations, and track weather conditions across multiple cities."
      safeAreaStyle={{ backgroundColor: Colors.bgLight }}
      contentContainerStyle={{ gap: 12 }}>
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

      <Pressable style={styles.saveLocationButton} onPress={handleSaveCurrentCity} disabled={loading}>
        <Text style={styles.locationButtonText}>Save This City</Text>
      </Pressable>

      <Pressable style={styles.locationButton} onPress={loadByLocation} disabled={loading}>
        <Text style={styles.locationButtonText}>Use Device Location</Text>
      </Pressable>

      {loading ? <ActivityIndicator size="large" color={Colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.city}>{weather?.city ?? 'No data yet'}</Text>
        <Text style={styles.temp}>{weather ? `${weather.temperatureC}°C` : '--'}</Text>
        <Text style={styles.condition}>{weather?.condition ?? 'Search city or use location'}</Text>
        <Text style={styles.minMax}>Min/Max: {minText} / {maxText}</Text>
        <Text style={styles.minMax}>Humidity: {weather ? `${weather.humidity}%` : '--'}</Text>
        <Text style={styles.time}>Updated: {weather?.updatedAt ?? '--'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.savedTitle}>Saved Locations</Text>
        {savedLocations.length === 0 ? (
          <Text style={styles.time}>No saved locations yet.</Text>
        ) : (
          savedLocations.map((location) => (
            <View key={location.id} style={styles.savedRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Pressable onPress={() => loadByCity(location.city)}>
                  <Text style={styles.savedCity}>{location.city}</Text>
                </Pressable>
                <Text style={styles.savedMeta}>
                  {savedWeatherByCity[location.city.toLowerCase()]
                    ? `${savedWeatherByCity[location.city.toLowerCase()].temperatureC}°C • ${savedWeatherByCity[location.city.toLowerCase()].condition}`
                    : 'Updating latest weather...'}
                </Text>
                <Text style={styles.time}>
                  Latest: {savedWeatherByCity[location.city.toLowerCase()]?.updatedAt ?? '--'}
                </Text>
              </View>
              <View style={styles.savedActions}>
                <Pressable onPress={() => refreshSavedLocationWeather([location.city])}>
                  <Text style={styles.refreshText}>Refresh</Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteLocation(location.id)}>
                  <Text style={styles.deleteText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}


const styles = StyleSheet.create({
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
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 6,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  city: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  temp: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  condition: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  minMax: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    color: Colors.textHint,
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
  },
  savedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: 8,
  },
  savedCity: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  deleteText: {
    color: Colors.error,
    fontWeight: '600',
  },
  savedActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 12,
    marginLeft: 10,
  },
  refreshText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  savedMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
