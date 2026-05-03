import { api, parseJsonData } from './api';

export type AuthPayload = {
  token: string;
  email: string;
  user_id: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  selected_city: string;
};

export type ProfilePayload = {
  full_name: string;
  avatar_url: string;
  bio: string;
  selected_city: string;
};

type UpdateProfileInput = Partial<ProfilePayload> & {
  avatar_image_uri?: string;
};

export async function signup(email: string, password: string): Promise<AuthPayload> {
  const response = await api.post('/auth/signup/', {
    email,
    password,
  });
  return parseJsonData<AuthPayload>(response.data);
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const response = await api.post('/auth/login/', {
    email,
    password,
  });
  return parseJsonData<AuthPayload>(response.data);
}

export async function me(): Promise<AuthPayload> {
  const response = await api.get('/auth/me/');
  return parseJsonData<AuthPayload>(response.data);
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout/');
}

export async function getProfile(): Promise<ProfilePayload> {
  const response = await api.get('/auth/profile/');
  return parseJsonData<ProfilePayload>(response.data);
}

export async function updateProfile(input: UpdateProfileInput): Promise<ProfilePayload> {
  const hasImage = Boolean(input.avatar_image_uri);

  if (!hasImage) {
    const { avatar_image_uri, ...rest } = input;
    const response = await api.patch('/auth/profile/', rest);
    return parseJsonData<ProfilePayload>(response.data);
  }

  const formData = new FormData();
  if (typeof input.full_name === 'string') {
    formData.append('full_name', input.full_name);
  }
  if (typeof input.avatar_url === 'string') {
    formData.append('avatar_url', input.avatar_url);
  }
  if (typeof input.bio === 'string') {
    formData.append('bio', input.bio);
  }
  if (typeof input.selected_city === 'string') {
    formData.append('selected_city', input.selected_city);
  }

  const uri = input.avatar_image_uri as string;
  const fileName = uri.split('/').pop() || `avatar-${Date.now()}.jpg`;
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  formData.append('avatar_image', {
    uri,
    name: fileName,
    type: mimeType,
  } as any);

  const response = await api.patch('/auth/profile/', formData);
  return parseJsonData<ProfilePayload>(response.data);
}
