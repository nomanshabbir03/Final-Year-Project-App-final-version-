import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';

export function ProfileScreen() {
  const { user, updateProfile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarImageUri, setAvatarImageUri] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName ?? '');
    setAvatarUrl(user?.avatarUrl ?? '');
    setAvatarImageUri(null);
    setBio(user?.bio ?? '');
  }, [user]);

  const pickImage = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Please allow photo library access to upload a profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatarImageUri(result.assets[0]?.uri ?? null);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    const normalizedName = fullName.trim();
    const normalizedBio = bio.trim();
    const normalizedAvatarUrl = avatarUrl.trim();

    const hasChanges =
      normalizedName !== (user?.fullName ?? '') ||
      normalizedBio !== (user?.bio ?? '') ||
      normalizedAvatarUrl !== (user?.avatarUrl ?? '') ||
      Boolean(avatarImageUri);

    if (!hasChanges) {
      setSuccess('No changes to save.');
      return;
    }

    setSaving(true);

    try {
      const result = await updateProfile({
        fullName: normalizedName,
        avatarUrl: normalizedAvatarUrl,
        avatarImageUri: avatarImageUri ?? undefined,
        bio: normalizedBio,
      });

      if (!result.ok) {
        setError(result.error ?? 'Could not save profile.');
        return;
      }

      setSuccess('Profile updated successfully.');
      setAvatarImageUri(null);
    } finally {
      setSaving(false);
    }
  };

  const avatarPreviewUri = avatarImageUri || avatarUrl;

  return (
    <ScreenContainer title="Profile" subtitle="Manage your account details.">
      <View style={styles.card}>
        {avatarPreviewUri ? <Image source={{ uri: avatarPreviewUri }} style={styles.avatar} /> : null}
        <Pressable style={styles.uploadButton} onPress={pickImage}>
          <Text style={styles.uploadButtonText}>Upload New Photo</Text>
        </Pressable>
        {avatarImageUri ? <Text style={styles.pendingUpload}>New image selected. Save to apply.</Text> : null}
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Display Photo URL</Text>
        <TextInput
          value={avatarUrl}
          onChangeText={setAvatarUrl}
          autoCapitalize="none"
          placeholder="https://..."
          style={styles.input}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          style={[styles.input, styles.textarea]}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ef',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#e2e8f0',
  },
  email: {
    color: '#334155',
    fontWeight: '600',
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  uploadButtonText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
  pendingUpload: {
    color: '#92400e',
    fontWeight: '600',
    fontSize: 12,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  group: {
    gap: 8,
  },
  label: {
    color: '#334155',
    fontWeight: '600',
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d9e6',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
  },
  textarea: {
    height: 90,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  error: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  success: {
    color: '#166534',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
