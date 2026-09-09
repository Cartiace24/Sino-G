import { supabase } from '../lib/supabase';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

function checkFile(file: File): void {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Images only — JPG, PNG, WebP, or GIF.');
  if (file.size > MAX_BYTES) throw new Error('Keep it under 5 MB.');
}

function extOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) return fromName;
  return file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
}

export const storageService = {
  async uploadProfileAvatar(userId: string, file: File): Promise<string> {
    checkFile(file);
    const path = `profiles/${userId}/${Date.now()}.${extOf(file)}`;
    const { error } = await supabase.storage
      .from('profile-avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadGroupAvatar(groupId: string, file: File): Promise<string> {
    checkFile(file);
    const path = `groups/${groupId}/${Date.now()}.${extOf(file)}`;
    const { error } = await supabase.storage
      .from('group-avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('group-avatars').getPublicUrl(path);
    return data.publicUrl;
  },
};
