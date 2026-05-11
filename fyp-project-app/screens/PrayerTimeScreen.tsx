import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Colors } from '../constants/theme';

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface DateInfo {
  readable: string;
  timestamp: string;
  gregorian: {
    date: string;
    day: string;
    weekday: { en: string };
    month: { number: number; en: string };
    year: string;
    designation: { abbreviated: string; expanded: string };
  };
  hijri: {
    date: string;
    day: string;
    weekday: { en: string; ar: string };
    month: { number: number; en: string; ar: string; days: number };
    year: string;
    designation: { abbreviated: string; expanded: string };
    holidays: any[];
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type PrayerTimeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function PrayerTimeScreen() {
  const navigation = useNavigation<PrayerTimeScreenNavigationProp>();
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cityName, setCityName] = useState('');
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [hijriDate, setHijriDate] = useState<DateInfo | null>(null);
  const [manualCity, setManualCity] = useState('');
  const [fetchingPrayerTimes, setFetchingPrayerTimes] = useState(false);
  const [isRamadan, setIsRamadan] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);


  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        getCurrentLocation();
      } else {
        setLocationError('Location permission denied. Please enter your city manually.');
        setLoading(false);
      }
    } catch (error) {
      setLocationError('Failed to get location permission. Please enter your city manually.');
      setLoading(false);
    }
  };

  const registerForPushNotifications = async () => {
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return false;
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }
    return true;
  };

  const schedulePrayerNotifications = async (prayers: PrayerTimes) => {
    // Cancel all existing scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    const prayerNames = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
    
    for (const prayerName of prayerNames) {
      const prayerTime = prayers[prayerName];
      const [hours, minutes] = prayerTime.split(':').map(Number);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🕌 Time for ${prayerName}`,
          body: `It is time for ${prayerName} prayer. ${formatTime(prayerTime)}`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
        },
      });
    }
    
    setNotificationsEnabled(true);
  };

  const enableNotifications = async () => {
    if (prayerTimes) {
      const hasPermission = await registerForPushNotifications();
      if (hasPermission) {
        await schedulePrayerNotifications(prayerTimes);
      }
    }
  };

  const getCurrentLocation = async () => {
    try {
      const currentPosition = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentPosition.coords;
      setLocation({ latitude, longitude });
      
      // Get city name from coordinates
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (reverseGeocode.length > 0) {
        const city = reverseGeocode[0].city || reverseGeocode[0].subregion || 'Unknown';
        setCityName(city);
      }
      
      await fetchPrayerTimes(latitude, longitude);
      
    } catch (error) {
      setLocationError('Failed to get location. Please enter your city manually.');
      setLoading(false);
    }
  };

  const fetchPrayerTimes = async (latitude: number, longitude: number) => {
    try {
      setFetchingPrayerTimes(true);
      const response = await fetch(
        `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=2`
      );
      const data = await response.json();
      
      if (data.code === 200) {
        const { timings, date } = data.data;
        setPrayerTimes({
          Fajr: timings.Fajr,
          Dhuhr: timings.Dhuhr,
          Asr: timings.Asr,
          Maghrib: timings.Maghrib,
          Isha: timings.Isha,
        });
        setHijriDate(date);
        console.log('DATE OBJECT:', JSON.stringify(date, null, 2));
        const hijriMonth = data.data.date.hijri.month.number;
        setIsRamadan(hijriMonth === 9);
        
        // Schedule prayer notifications
        const hasPermission = await registerForPushNotifications();
        if (hasPermission) {
          await schedulePrayerNotifications({
            Fajr: timings.Fajr,
            Dhuhr: timings.Dhuhr,
            Asr: timings.Asr,
            Maghrib: timings.Maghrib,
            Isha: timings.Isha,
          });
        }
      } else {
        setLocationError('Failed to fetch prayer times. Please try again.');
      }
    } catch (error) {
      setLocationError('Failed to fetch prayer times. Please try again.');
    } finally {
      setLoading(false);
      setFetchingPrayerTimes(false);
    }
  };

  const fetchPrayerTimesByCity = async (city: string) => {
    try {
      setFetchingPrayerTimes(true);
      setLocationError(null);
      const response = await fetch(
        `https://api.aladhan.com/v1/timingsByCity?city=${city}&country=PK&method=2`
      );
      const data = await response.json();
      
      if (data.code === 200) {
        const { timings, date } = data.data;
        setPrayerTimes({
          Fajr: timings.Fajr,
          Dhuhr: timings.Dhuhr,
          Asr: timings.Asr,
          Maghrib: timings.Maghrib,
          Isha: timings.Isha,
        });
        setHijriDate(date);
        console.log('DATE OBJECT:', JSON.stringify(date, null, 2));
        const hijriMonth = data.data.date.hijri.month.number;
        setIsRamadan(hijriMonth === 9);
        setCityName(city);
        
        // Schedule prayer notifications
        const hasPermission = await registerForPushNotifications();
        if (hasPermission) {
          await schedulePrayerNotifications({
            Fajr: timings.Fajr,
            Dhuhr: timings.Dhuhr,
            Asr: timings.Asr,
            Maghrib: timings.Maghrib,
            Isha: timings.Isha,
          });
        }
        
      } else {
        setLocationError('Failed to fetch prayer times for this city. Please try again.');
      }
    } catch (error) {
      setLocationError('Failed to fetch prayer times for this city. Please try again.');
    } finally {
      setLoading(false);
      setFetchingPrayerTimes(false);
    }
  };

  const handleManualCitySubmit = () => {
    if (manualCity.trim()) {
      fetchPrayerTimesByCity(manualCity.trim());
    }
  };


  const getCurrentOrNextPrayer = () => {
    if (!prayerTimes) return null;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const prayers = [
      { name: 'Fajr', time: prayerTimes.Fajr, emoji: '🌙' },
      { name: 'Dhuhr', time: prayerTimes.Dhuhr, emoji: '☀️' },
      { name: 'Asr', time: prayerTimes.Asr, emoji: '🌤️' },
      { name: 'Maghrib', time: prayerTimes.Maghrib, emoji: '🌅' },
      { name: 'Isha', time: prayerTimes.Isha, emoji: '🌙' },
    ];
    
    for (const prayer of prayers) {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTime = hours * 60 + minutes;
      if (prayerTime > currentTime) {
        return prayer.name;
      }
    }
    
    return 'Fajr'; // Next day's Fajr
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const nextPrayer = getCurrentOrNextPrayer();
  const sehriTime = prayerTimes?.Fajr || null;
  const iftarTime = prayerTimes?.Maghrib || null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Prayer Times</Text>
          <Text style={styles.subtitle}>Daily prayer times based on your location.</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.qiblaIconButton} onPress={() => navigation.navigate('Qibla')}>
            <Text style={styles.qiblaIcon}>🕋</Text>
          </Pressable>
          <Pressable style={styles.settingsIconButton} onPress={() => navigation.navigate('AdhanSettings')}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.contentCard}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Getting location...</Text>
        </View>
      ) : locationError ? (
        <View style={styles.contentCard}>
          <Text style={styles.errorText}>{locationError}</Text>
          <TextInput
            style={styles.cityInput}
            placeholder="Enter your city name"
            value={manualCity}
            onChangeText={setManualCity}
            placeholderTextColor={Colors.textSecondary}
          />
          <Pressable style={styles.fetchButton} onPress={handleManualCitySubmit}>
            <Text style={styles.fetchButtonText}>
              {fetchingPrayerTimes ? 'Loading...' : 'Get Prayer Times'}
            </Text>
          </Pressable>
        </View>
      ) : prayerTimes && hijriDate ? (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Date Badges */}
          <View style={styles.dateRow}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateLabel}>Gregorian</Text>
              <Text style={styles.dateText}>
                {hijriDate.gregorian.day} {(hijriDate.gregorian.month as any).en} {hijriDate.gregorian.year}
              </Text>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateLabel}>Hijri</Text>
              <Text style={styles.dateText}>
                {hijriDate.hijri.day} {(hijriDate.hijri.month as any).en} {hijriDate.hijri.year} AH
              </Text>
            </View>
          </View>

          {/* Ramadan Card */}
          {isRamadan && (
            <View style={styles.ramadanCard}>
              <View style={styles.ramadanHeader}>
                <Text style={styles.ramadanEmoji}>🌙</Text>
                <Text style={styles.ramadanTitle}>Ramadan Mubarak</Text>
              </View>
              <View style={styles.ramadanTimes}>
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Sehri ends</Text>
                  <Text style={styles.timeValue}>{formatTime(sehriTime || '')}</Text>
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Iftar time</Text>
                  <Text style={styles.timeValue}>{formatTime(iftarTime || '')}</Text>
                </View>
              </View>
              <Text style={styles.ramadanSubtitle}>Fast from Sehri to Iftar</Text>
            </View>
          )}

          {/* City Name */}
          <Text style={styles.cityName}>{cityName}</Text>

          {/* Prayer Times */}
          <View style={styles.prayerContainer}>
            {[
              { name: 'Fajr', time: prayerTimes.Fajr, emoji: '🌙' },
              { name: 'Dhuhr', time: prayerTimes.Dhuhr, emoji: '☀️' },
              { name: 'Asr', time: prayerTimes.Asr, emoji: '🌤️' },
              { name: 'Maghrib', time: prayerTimes.Maghrib, emoji: '🌅' },
              { name: 'Isha', time: prayerTimes.Isha, emoji: '🌙' },
            ].map((prayer) => (
              <View
                key={prayer.name}
                style={[
                  styles.prayerCard,
                  prayer.name === nextPrayer && styles.nextPrayerCard,
                ]}
              >
                <View style={styles.prayerLeft}>
                  <Text style={styles.prayerEmoji}>{prayer.emoji}</Text>
                  <Text style={styles.prayerName}>{prayer.name}</Text>
                </View>
                <Text style={styles.prayerTime}>{formatTime(prayer.time)}</Text>
              </View>
            ))}
          </View>

          {/* Notification Status */}
          <View style={styles.notificationContainer}>
            {notificationsEnabled ? (
              <View style={styles.notificationCard}>
                <Text style={styles.notificationText}>✅ Prayer notifications are active</Text>
              </View>
            ) : (
              <View style={styles.notificationCard}>
                <Text style={styles.notificationText}>🔔 Notifications not enabled</Text>
                <Pressable style={styles.enableButton} onPress={enableNotifications}>
                  <Text style={styles.enableButtonText}>Enable</Text>
                </Pressable>
              </View>
            )}
          </View>

          {fetchingPrayerTimes && (
            <View style={styles.refreshingOverlay}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.contentCard}>
          <Text style={styles.errorText}>Failed to load prayer times.</Text>
          <Pressable style={styles.fetchButton} onPress={() => location ? fetchPrayerTimes(location.latitude, location.longitude) : {}}>
            <Text style={styles.fetchButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
    paddingTop: 40,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  qiblaIconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  qiblaIcon: {
    fontSize: 28,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsIconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  settingsIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  contentCard: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  cityInput: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
    marginBottom: 16,
  },
  fetchButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fetchButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    gap: 12,
  },
  dateBadge: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  cityName: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  prayerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  prayerCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  nextPrayerCard: {
    backgroundColor: '#dcfce7',
    borderColor: Colors.primary,
  },
  prayerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prayerEmoji: {
    fontSize: 20,
  },
  prayerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  prayerTime: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  refreshingOverlay: {
    position: 'absolute',
    right: 18,
    top: 14,
  },
  ramadanCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 2,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  ramadanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
  },
  ramadanEmoji: {
    fontSize: 24,
  },
  ramadanTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
  },
  ramadanTimes: {
    gap: 8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 12,
  },
  timeLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  ramadanSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  notificationContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  notificationCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    alignItems: 'center',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  notificationText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  enableButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  enableButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
