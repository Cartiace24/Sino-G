import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, ImagePlus, Settings2, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup, useMyGroups, useRealtimeGroup } from '../../hooks/useGroups';
import { todayISO } from '../../hooks/useAvailability';
import { groupsService } from '../../services/groups.service';
import { storageService } from '../../services/storage.service';
import { friendlyError } from '../../utils/errors';
import { qk } from '../../lib/queryClient';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { useConfirm } from '../../components/common/ConfirmSheet';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';
import type { GroupInviteRow } from '../../types/database.types';

type InviteState = 'active' | 'expired' | 'maxed';

function inviteState(inv: GroupInviteRow, now: number): InviteState {
  if (inv.expires_at && new Date(inv.expires_at).getTime() < now) return 'expired';
  if (inv.max_uses != null && inv.uses >= inv.max_uses) return 'maxed';
  return 'active';
}

const STATE_DOT: Record<InviteState, string> = { active: 'free', expired: 'busy', maxed: 'maybe' };

export function GroupSettings() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const groupQ = useGroup(groupId);
  const myGroupsQ = useMyGroups(user?.id);
  // Live renames / avatar swaps / deletions and permission changes.
  useRealtimeGroup(groupId);

  const group = groupQ.data;
  const myRole = myGroupsQ.data?.find((g) => g.id === groupId)?.my_role;
  const isOwner = myRole === 'owner';
  const canManage = isOwner || myRole === 'admin';

  const invitesQ = useQuery({
    queryKey: groupId ? qk.groupInvites(groupId) : ['group-invites', 'none'],
    queryFn: () => groupsService.invites(groupId!),
    enabled: Boolean(groupId) && canManage,
  });

  // ---- info form state (seeded from the group once loaded) ----
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [infoError, setInfoError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (group && !seeded) {
      setName(group.name);
      setDescription(group.description ?? '');
      setSeeded(true);
    }
  }, [group, seeded]);

  // ---- avatar draft ----
  const [draft, setDraft] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  // ---- invite composer ----
  const [expMode, setExpMode] = useState<'never' | 'custom'>('never');
  const [expDate, setExpDate] = useState('');
  const [useMode, setUseMode] = useState<'unlimited' | 'limited'>('unlimited');
  const [maxUses, setMaxUses] = useState('5');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const refreshGroup = () => {
    qc.invalidateQueries({ queryKey: qk.group(groupId!) });
    qc.invalidateQueries({ queryKey: ['groups'] });
  };

  const infoMut = useMutation({
    mutationFn: () =>
      groupsService.update(groupId!, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: () => {
      setInfoError(null);
      refreshGroup();
      toast('<b>Saved.</b> The group is up to date.');
    },
    onError: (err) => setInfoError(friendlyError(err, 'Could not save changes.')),
  });

  const onSaveInfo = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setInfoError('Give your group a name first.');
      return;
    }
    if (name.trim().length > 60) {
      setInfoError('Keep the group name under 60 characters.');
      return;
    }
    infoMut.mutate();
  };

  const avatarMut = useMutation({
    mutationFn: async () => {
      if (!draft || !group) throw new Error('Pick a photo first.');
      const prevAvatar = group.avatar_url ?? null;
      const url = await storageService.uploadGroupAvatar(group.id, draft);
      const updated = await groupsService.update(group.id, { avatar_url: url });
      if (prevAvatar && prevAvatar !== url) {
        void storageService.deleteGroupAvatarByUrl(prevAvatar);
      }
      return updated;
    },
    onSuccess: () => {
      setAvatarError(null);
      setDraft(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      previewUrl.current = null;
      if (fileRef.current) fileRef.current.value = '';
      refreshGroup();
      toast('<b>New look.</b> Avatar updated.');
    },
    onError: (err) => setAvatarError(friendlyError(err, 'Could not update the avatar.')),
  });

  const clearAvatarMut = useMutation({
    mutationFn: () => groupsService.update(groupId!, { avatar_url: null }),
    onSuccess: () => {
      refreshGroup();
      toast('Avatar removed.');
    },
    onError: (err) => setAvatarError(friendlyError(err, 'Could not remove the avatar.')),
  });

  const onPickAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDraft(f);
    setAvatarError(null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(f);
    setPreview(previewUrl.current);
  };

  const createInviteMut = useMutation({
    mutationFn: () => {
      let expires_at: string | null = null;
      if (expMode === 'custom') {
        if (!expDate) throw new Error('Pick an expiration date, or choose Never.');
        const ts = new Date(`${expDate}T23:59:59`).getTime();
        if (Number.isNaN(ts) || ts <= Date.now()) throw new Error('Expiration has to be in the future.');
        expires_at = new Date(ts).toISOString();
      }
      let max_uses: number | null = null;
      if (useMode === 'limited') {
        max_uses = Number.parseInt(maxUses, 10);
        if (!Number.isFinite(max_uses) || max_uses < 1) throw new Error('Max uses needs to be at least 1.');
      }
      return groupsService.createInvite(groupId!, user!.id, { expires_at, max_uses });
    },
    onSuccess: (inv) => {
      setInviteError(null);
      qc.invalidateQueries({ queryKey: qk.groupInvites(groupId!) });
      toast(`<b>Invite ready:</b> ${inv.invite_code}`);
    },
    onError: (err) => setInviteError(friendlyError(err, 'Could not create the invite.')),
  });

  const revokeMut = useMutation({
    mutationFn: (inviteId: string) => groupsService.deleteInvite(inviteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupInvites(groupId!) });
      toast('Invite revoked. That code is dead.');
    },
    onError: (err) => toast(friendlyError(err, 'Could not revoke that invite.')),
  });

  const onRevoke = async (code: string, inviteId: string) => {
    const ok = await confirm({
      title: `REVOKE ${code}?`,
      body: 'Anyone holding it will no longer be able to join.',
      confirmLabel: 'Revoke invite',
      danger: true,
    });
    if (ok) revokeMut.mutate(inviteId);
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`<b>Copied:</b> ${label}`);
    } catch {
      toast(`Code: <b>${label}</b>`);
    }
  };

  const deleteMut = useMutation({
    mutationFn: () => groupsService.remove(groupId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast('Group deleted.');
      navigate('/groups', { replace: true });
    },
    onError: (err) => toast(friendlyError(err, 'Could not delete the group.')),
  });

  if (groupQ.isLoading) return <LoadingRows rows={5} />;
  if (!group) {
    return (
      <div style={{ paddingTop: 30 }}>
        <EmptyState
          icon={<Settings2 size={30} />}
          title="Can't open these settings."
          body="You may have been removed, or the link is wrong."
          action={
            <Button variant="line" size="sm" onClick={() => navigate('/groups')}>
              Back to groups
            </Button>
          }
        />
      </div>
    );
  }

  const invites = invitesQ.data ?? [];
  const now = Date.now();

  return (
    <>
      <Link className="backlink" to={`/groups/${group.id}`} style={{ marginTop: 14 }}>
        <ArrowLeft size={16} /> {group.name.toUpperCase().slice(0, 18)}
      </Link>
      <p className="kicker">GROUP SETTINGS · {myRole?.toUpperCase() ?? 'MEMBER'}</p>
      <h1 className="display lg">
        THE
        <br />
        DETAILS.
      </h1>

      {/* ---------- INFO ---------- */}
      <div className="setgroup" style={{ marginTop: 18 }}>
        <span className="kicker">GROUP INFO</span>
        {canManage ? (
          <form onSubmit={onSaveInfo} style={{ marginTop: 10 }}>
            <div className="field">
              <Label htmlFor="gs-name">Group name</Label>
              <Input id="gs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="field">
              <Label htmlFor="gs-desc">Description (optional)</Label>
              <Input
                id="gs-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this crew about?"
              />
            </div>
            <FieldError message={infoError} />
            <Button type="submit" variant="dark" size="block" disabled={infoMut.isPending}>
              {infoMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        ) : (
          <div style={{ padding: '10px 2px' }}>
            <p style={{ fontWeight: 700 }}>{group.name}</p>
            {group.description && <p className="small muted">{group.description}</p>}
            <p className="small muted" style={{ marginTop: 8 }}>
              Only owners and admins can change settings.
            </p>
          </div>
        )}
      </div>

      {/* ---------- AVATAR ---------- */}
      <div className="setgroup">
        <span className="kicker">GROUP PHOTO</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 2px' }}>
          {preview || group.avatar_url ? (
            <img
              src={preview ?? group.avatar_url!}
              alt=""
              className="gavatar big"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <span className="gavatar big">
              {group.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          )}
          {canManage && (
            <div style={{ display: 'grid', gap: 8 }}>
              <Button variant="paper" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={15} /> {group.avatar_url || preview ? 'Change photo' : 'Add photo'}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
              {(group.avatar_url && !preview) && (
                <Button
                  variant="paper"
                  size="sm"
                  style={{ color: 'var(--busy)' }}
                  disabled={clearAvatarMut.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'REMOVE PHOTO?',
                      body: 'The group will go back to its initials tile.',
                      confirmLabel: 'Remove',
                      danger: true,
                    });
                    if (ok) clearAvatarMut.mutate();
                  }}
                >
                  <Trash2 size={15} /> Remove
                </Button>
              )}
            </div>
          )}
        </div>
        {canManage && preview && (
          <>
            <FieldError message={avatarError} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="green" size="sm" disabled={avatarMut.isPending} onClick={() => avatarMut.mutate()}>
                {avatarMut.isPending ? 'Uploading…' : 'Save photo'}
              </Button>
              <Button
                variant="paper"
                size="sm"
                onClick={() => {
                  setDraft(null);
                  setPreview((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                  previewUrl.current = null;
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Discard
              </Button>
            </div>
          </>
        )}
        {canManage && !preview && <FieldError message={avatarError} />}
      </div>

      {/* ---------- INVITES ---------- */}
      {canManage && (
        <div className="setgroup">
          <span className="kicker">INVITES</span>
          <button
            className="setrow"
            onClick={() => copyText(group.invite_code, `Join ${group.name} on Sino G! Code: ${group.invite_code}`)}
          >
            <Copy size={17} />
            <span>
              Main code · <b style={{ fontFamily: 'var(--font-d)', letterSpacing: '.08em' }}>{group.invite_code}</b>
              <br />
              <small className="muted">Never expires · unlimited uses</small>
            </span>
            <span className="small muted" style={{ marginLeft: 'auto' }}>COPY</span>
          </button>

          <div style={{ marginTop: 14 }}>
            <span className="kicker">EXTRA CODES · {invites.length}</span>
            {invitesQ.isLoading ? (
              <LoadingRows rows={2} />
            ) : invites.length === 0 ? (
              <p className="small muted" style={{ padding: '10px 2px' }}>
                No extra codes. Mint one below for a party, a plus-one wave, anything.
              </p>
            ) : (
              <div className="rows" style={{ marginTop: 6 }}>
                {invites.map((inv) => {
                  const st = inviteState(inv, now);
                  return (
                    <div className="member-row" key={inv.id}>
                      <span className="who">
                        <strong style={{ fontFamily: 'var(--font-d)', letterSpacing: '.08em' }}>
                          {inv.invite_code}
                        </strong>
                        <small>
                          <span className={`dot ${STATE_DOT[st]}`} /> {st.toUpperCase()} · {inv.uses}
                          {inv.max_uses != null ? `/${inv.max_uses}` : ' uses'}
                          {inv.expires_at
                            ? ` · until ${new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : ' · never expires'}
                        </small>
                      </span>
                      <span className="right">
                        <button
                          className="btn btn-paper btn-sm"
                          onClick={() => copyText(inv.invite_code, inv.invite_code)}
                          aria-label={`Copy invite ${inv.invite_code}`}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          className="btn btn-paper btn-sm"
                          style={{ color: 'var(--busy)' }}
                          aria-label={`Revoke invite ${inv.invite_code}`}
                          disabled={revokeMut.isPending}
                          onClick={() => onRevoke(inv.invite_code, inv.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <span className="kicker">MINT A NEW CODE</span>
            <div className="field" style={{ marginTop: 10 }}>
              <Label>Expiration</Label>
              <div className="chiprow">
                <button type="button" className={`chip${expMode === 'never' ? ' sel' : ''}`} onClick={() => setExpMode('never')}>
                  Never
                </button>
                <button type="button" className={`chip${expMode === 'custom' ? ' sel' : ''}`} onClick={() => setExpMode('custom')}>
                  Custom date
                </button>
              </div>
              {expMode === 'custom' && (
                <div style={{ marginTop: 10 }}>
                  <Input type="date" min={todayISO()} value={expDate} onChange={(e) => setExpDate(e.target.value)} />
                </div>
              )}
            </div>
            <div className="field">
              <Label>Maximum uses</Label>
              <div className="chiprow">
                <button type="button" className={`chip${useMode === 'unlimited' ? ' sel' : ''}`} onClick={() => setUseMode('unlimited')}>
                  Unlimited
                </button>
                <button type="button" className={`chip${useMode === 'limited' ? ' sel' : ''}`} onClick={() => setUseMode('limited')}>
                  Limited
                </button>
              </div>
              {useMode === 'limited' && (
                <div style={{ marginTop: 10, maxWidth: 140 }}>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                  />
                </div>
              )}
            </div>
            <FieldError message={inviteError} />
            <Button variant="green" size="block" disabled={createInviteMut.isPending} onClick={() => createInviteMut.mutate()}>
              {createInviteMut.isPending ? 'Minting…' : 'Create invite'}
            </Button>
          </div>
        </div>
      )}

      {/* ---------- DANGER ZONE ---------- */}
      {isOwner && (
        <div className="setgroup">
          <span className="kicker" style={{ color: 'var(--busy)' }}>DANGER ZONE</span>
          <p className="small muted" style={{ padding: '10px 2px' }}>
            Deleting this group will permanently remove the group and its associated memberships, invites,
            and related data according to the existing database cascade rules. This can&apos;t be undone.
          </p>
          <Button
            variant="paper"
            size="block"
            style={{ color: 'var(--busy)' }}
            disabled={deleteMut.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: `DELETE ${group.name.toUpperCase().slice(0, 20)}?`,
                body: 'Memberships, invites, and related data go with it. This can’t be undone.',
                confirmLabel: 'Delete group',
                danger: true,
              });
              if (ok) deleteMut.mutate();
            }}
          >
            <Trash2 size={16} /> {deleteMut.isPending ? 'Deleting…' : 'Delete group'}
          </Button>
        </div>
      )}
    </>
  );
}
