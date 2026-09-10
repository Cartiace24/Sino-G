import { supabase } from '../lib/supabase';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;
/** Largest avatar edge — phone photos shrink to ~150KB instead of hard-failing 5MB. */
const MAX_EDGE = 512;

function checkFile(file: File): void {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Images only — JPG, PNG, WebP, or GIF.');
  if (file.size > MAX_BYTES) throw new Error('Keep it under 5 MB.');
}

function extOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) return fromName;
  return file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
}

/**
 * Downscale to MAX_EDGE (canvas) so mobile photos don't hard-fail.
 * GIFs pass through untouched (resizing would kill animation).
 */
async function compressAvatar(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;
  // Tiny files aren't worth re-encoding.
  if (file.size < 300 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const outType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outType, 0.82),
    );
    if (!blob) return file;
    const ext = outType === 'image/png' ? 'png' : outType === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'avatar';
    return new File([blob], `${base}.${ext}`, { type: outType });
  } catch {
    return file;
  }
}

function pathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]) || null;
}

/** Best-effort orphan cleanup — never throws (call after the row update succeeds). */
async function deleteByPublicUrl(bucket: string, url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const path = pathFromPublicUrl(bucket, url);
    if (!path) return;
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    /* orphan stays — harmless, cleaned by the storage lifecycle */
  }
}

export const storageService = {
  async uploadProfileAvatar(userId: string, file: File): Promise<string> {
    checkFile(file);
    const compact = await compressAvatar(file);
    const path = `profiles/${userId}/${Date.now()}.${extOf(compact)}`;
    const { error } = await supabase.storage
      .from('profile-avatars')
      .upload(path, compact, { upsert: true, contentType: compact.type });
    if (error) throw error;
    const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadGroupAvatar(groupId: string, file: File): Promise<string> {
    checkFile(file);
    const compact = await compressAvatar(file);
    const path = `groups/${groupId}/${Date.now()}.${extOf(compact)}`;
    const { error } = await supabase.storage
      .from('group-avatars')
      .upload(path, compact, { upsert: true, contentType: compact.type });
    if (error) throw error;
    const { data } = supabase.storage.from('group-avatars').getPublicUrl(path);
    return data.publicUrl;
  },

  deleteProfileAvatarByUrl: (url: string | null | undefined) =>
    deleteByPublicUrl('profile-avatars', url),
  deleteGroupAvatarByUrl: (url: string | null | undefined) =>
    deleteByPublicUrl('group-avatars', url),
};
